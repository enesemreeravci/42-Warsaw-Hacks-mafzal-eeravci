import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, filter, of, switchMap, timer } from 'rxjs';
import type {
  AppConfigResponse,
  CampusEvent,
  ClusterOccupancyResponse,
  CoalitionStanding,
  CompletionTrendPoint,
  DashboardSummary,
  EvaluationEntry,
  Ft42Status,
  LivePulseResponse,
  ProjectCompletion,
  ProjectMetric,
  StudentRanking,
  WeeklyCampusActivityResponse,
} from '../models/api.models';
import type { NormalizedApiError } from '../interceptors/error.interceptor';
import { ApiService } from './api.service';
import { LoadCycleService } from './load-cycle.service';
import { VisibilityService } from './visibility.service';

const DEFAULT_AUTO_REFRESH_SECONDS = 300;
const STATUS_POLL_MS = 60_000;
/** While the backend is still warming its cache (cold start / fresh restart, see
 * ApiEnvelope.meta.warming), poll far more often than the normal auto-refresh interval so the
 * dashboard swaps in real data within seconds of the first background-refresh cycle finishing,
 * instead of sitting on an empty placeholder for up to DEFAULT_AUTO_REFRESH_SECONDS. */
const WARMUP_RETRY_SECONDS = 5;

export interface DashboardData {
  summary: DashboardSummary | null;
  recentCompletions: ProjectCompletion[];
  trend: CompletionTrendPoint[];
  topProjects: ProjectMetric[];
  topStudentsByLevel: StudentRanking[];
  topStudentsByCompletedProjects: StudentRanking[];
  livePulse: LivePulseResponse | null;
  coalitions: CoalitionStanding[];
  evaluations: EvaluationEntry[];
  weeklyCampusActivity: WeeklyCampusActivityResponse | null;
  upcomingEvents: CampusEvent[];
  clusterOccupancy: ClusterOccupancyResponse | null;
}

/**
 * Single source of truth for dashboard view state. Owns loading/refreshing/error/stale
 * flags, auto-refresh polling (tab-visibility aware), and the selected display period.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly api = inject(ApiService);
  private readonly visibility = inject(VisibilityService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loadCycle = inject(LoadCycleService);

  private readonly dataSignal = signal<DashboardData>({
    summary: null,
    recentCompletions: [],
    trend: [],
    topProjects: [],
    topStudentsByLevel: [],
    topStudentsByCompletedProjects: [],
    livePulse: null,
    coalitions: [],
    evaluations: [],
    weeklyCampusActivity: null,
    upcomingEvents: [],
    clusterOccupancy: null,
  });

  private readonly loadingSignal = signal(true);
  private readonly refreshingSignal = signal(false);
  private readonly errorSignal = signal<NormalizedApiError | null>(null);
  private readonly staleSignal = signal(false);
  private readonly warmingSignal = signal(false);
  private readonly lastSuccessfulUpdateSignal = signal<Date | null>(null);
  private readonly lastFailedUpdateSignal = signal<Date | null>(null);
  private readonly autoRefreshEnabledSignal = signal(true);
  private readonly autoRefreshIntervalSecondsSignal = signal(DEFAULT_AUTO_REFRESH_SECONDS);
  private readonly countdownSecondsSignal = signal(DEFAULT_AUTO_REFRESH_SECONDS);
  private readonly selectedPeriodDaysSignal = signal(30);
  private readonly configSignal = signal<AppConfigResponse | null>(null);
  private readonly ft42StatusSignal = signal<Ft42Status | null>(null);
  /** Per-dataset error from the most recent load cycle, keyed by DashboardData field name.
   * A dataset failing here does NOT blank the rest of the dashboard - the previous value for
   * that field is kept and this map is how the failure stays visible instead of silently
   * turning into an empty array. Cleared for a field as soon as it next succeeds. */
  private readonly partialErrorsSignal = signal<Partial<Record<keyof DashboardData, string>>>({});

  readonly data = this.dataSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly refreshing = this.refreshingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly stale = this.staleSignal.asReadonly();
  readonly warming = this.warmingSignal.asReadonly();
  readonly lastSuccessfulUpdate = this.lastSuccessfulUpdateSignal.asReadonly();
  readonly lastFailedUpdate = this.lastFailedUpdateSignal.asReadonly();
  readonly autoRefreshEnabled = this.autoRefreshEnabledSignal.asReadonly();
  readonly autoRefreshIntervalSeconds = this.autoRefreshIntervalSecondsSignal.asReadonly();
  readonly countdownSeconds = this.countdownSecondsSignal.asReadonly();
  readonly selectedPeriodDays = this.selectedPeriodDaysSignal.asReadonly();
  readonly config = this.configSignal.asReadonly();
  readonly ft42Status = this.ft42StatusSignal.asReadonly();
  readonly partialErrors = this.partialErrorsSignal.asReadonly();

  private readonly manualRefresh$ = new Subject<void>();
  private isFetching = false;
  private initialized = false;
  /** True once a load cycle has completed with real (non-warming) data at least once. Distinct
   * from `dataSignal().summary !== null`: a warming cycle already populates `summary` with a
   * structurally valid but all-zero placeholder, so that check alone can't tell "first load still
   * warming" apart from "genuinely loaded" - which would otherwise flip the skeleton off after the
   * very first empty warmup response instead of keeping it up through every retry. */
  private hasLoadedRealData = false;
  /** OR'd across every field in the current load cycle (reset per loadAll()) - a coalition or
   * evaluations response can still be warming after summary already has real data, since the
   * backend's core-refresh cycle populates its caches sequentially (roster, then coalitions,
   * then evaluations). Drives the fast warmup retry cadence and the header badge, so a
   * lagging field keeps polling instead of waiting out the full auto-refresh interval. */
  private cycleWarming = false;
  /** Specifically summary's warming flag - summary is the fast/core field, so this alone gates
   * the full-page loading skeleton. Gating it on `cycleWarming` instead (every field) made the
   * whole dashboard sit on the skeleton until the *slowest* field (evaluations, which can page
   * through a couple thousand mostly-unfilled scale_teams records) finished, even though summary
   * and most other cards were already long ready - exactly the "stuck for two minutes" report. */
  private summaryWarming = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.api.getConfig().subscribe({
      next: (envelope) => {
        this.configSignal.set(envelope.data);
        this.autoRefreshIntervalSecondsSignal.set(envelope.data.autoRefreshSeconds);
        this.countdownSecondsSignal.set(envelope.data.autoRefreshSeconds);
      },
      error: () => undefined,
    });

    this.loadAll();
    this.startCountdownTimer();
    this.startStatusPolling();

    this.manualRefresh$
      .pipe(
        filter(() => !this.isFetching),
        switchMap(() => this.api.refreshDashboard().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadAll());
  }

  private startStatusPolling(): void {
    const fetchStatus = () =>
      this.api.getFt42Status().subscribe({ next: (res) => this.ft42StatusSignal.set(res.data), error: () => undefined });
    fetchStatus();
    timer(STATUS_POLL_MS, STATUS_POLL_MS)
      .pipe(
        filter(() => !this.visibility.hidden()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(fetchStatus);
  }

  refreshNow(): void {
    this.manualRefresh$.next();
  }

  toggleAutoRefresh(): void {
    this.autoRefreshEnabledSignal.update((v) => !v);
  }

  setAutoRefreshInterval(seconds: number): void {
    const clamped = Math.max(15, seconds);
    this.autoRefreshIntervalSecondsSignal.set(clamped);
    this.countdownSecondsSignal.set(clamped);
  }

  setPeriodDays(days: number): void {
    this.selectedPeriodDaysSignal.set(days);
    this.loadAll();
  }

  private startCountdownTimer(): void {
    timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.visibility.hidden() || !this.autoRefreshEnabledSignal() || this.isFetching) {
          return;
        }
        const remaining = this.countdownSecondsSignal() - 1;
        if (remaining <= 0) {
          this.countdownSecondsSignal.set(this.autoRefreshIntervalSecondsSignal());
          this.loadAll();
        } else {
          this.countdownSecondsSignal.set(remaining);
        }
      });
  }

  /** Wraps one dataset call so its failure can't blank the rest of the dashboard: records the
   * error against `field` (visible via `partialErrors()`) and resolves with `null` instead of
   * throwing, so one failing endpoint never stops the others from rendering. */
  private withPartialFailure<T>(field: keyof DashboardData, source: import('rxjs').Observable<T>) {
    return source.pipe(
      catchError((err: NormalizedApiError) => {
        this.partialErrorsSignal.update((errors) => ({ ...errors, [field]: err.message }));
        return of(null);
      }),
    );
  }

  /** Subscribes one dataset independently of the others, so its card updates the moment *its*
   * endpoint responds instead of waiting for the slowest one in the batch (which `forkJoin`
   * would otherwise force, even with every source already degrading failures to `null`). */
  private loadField<T>(
    loadId: string,
    field: keyof DashboardData,
    source: import('rxjs').Observable<T>,
    apply: (data: DashboardData, value: T) => DashboardData,
    onSettled: (succeeded: boolean) => void,
  ): void {
    this.withPartialFailure(field, source)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (this.loadCycle.currentId() !== loadId) {
          onSettled(false); // superseded by a newer load cycle
          return;
        }

        if (value !== null) {
          this.dataSignal.update((prev) => apply(prev, value));
          this.partialErrorsSignal.update((errors) => {
            if (!(field in errors)) return errors;
            const next = { ...errors };
            delete next[field];
            return next;
          });
          if ((value as { meta?: { warming?: boolean } }).meta?.warming) {
            this.cycleWarming = true;
            if (field === 'summary') this.summaryWarming = true;
          }
        }

        onSettled(value !== null);
      });
  }

  private loadAll(): void {
    if (this.isFetching) return;
    this.isFetching = true;
    const loadId = this.loadCycle.startNewCycle();

    if (this.hasLoadedRealData) {
      this.refreshingSignal.set(true);
    } else {
      this.loadingSignal.set(true);
    }

    this.cycleWarming = false;
    this.summaryWarming = false;
    const days = this.selectedPeriodDaysSignal();

    let remaining = 11;
    let anySucceeded = false;

    const onSettled = (succeeded: boolean): void => {
      anySucceeded = anySucceeded || succeeded;
      remaining -= 1;
      if (remaining > 0) return;

      this.isFetching = false;
      this.refreshingSignal.set(false);

      // The backend's first-ever cache load can legitimately take a while (large roster, 42 API
      // rate limits). Until summary lands, its "successful" response is a structurally valid but
      // empty placeholder - keep showing the loading skeleton for that. Slower fields (coalitions,
      // evaluations) don't hold the skeleton up once summary is ready, but still retry every
      // WARMUP_RETRY_SECONDS on their own instead of waiting the full auto-refresh interval.
      const stillWarming = this.cycleWarming;
      this.warmingSignal.set(stillWarming);
      if (!this.summaryWarming && anySucceeded) {
        this.hasLoadedRealData = true;
      }
      this.loadingSignal.set(this.summaryWarming && !this.hasLoadedRealData);
      if (stillWarming) {
        this.countdownSecondsSignal.set(WARMUP_RETRY_SECONDS);
      }

      if (anySucceeded) {
        this.errorSignal.set(null);
        this.lastSuccessfulUpdateSignal.set(new Date());
      } else {
        // Every dataset failed this cycle (e.g. the backend is unreachable) - surface it as a
        // hard error instead of silently leaving stale/empty cards with no explanation.
        const firstMessage = Object.values(this.partialErrorsSignal())[0] ?? 'Failed to load dashboard data.';
        this.errorSignal.set({ code: 'LOAD_FAILED', message: firstMessage, status: 0 });
        this.lastFailedUpdateSignal.set(new Date());
      }
    };

    this.loadField(loadId, 'summary', this.api.getDashboardSummary(), (data, envelope) => {
      this.staleSignal.set(Boolean(envelope.meta.staleData) && !envelope.meta.warming);
      return { ...data, summary: envelope.data };
    }, onSettled);
    this.loadField(loadId, 'recentCompletions', this.api.getRecentCompletions(7, 20), (data, envelope) => ({
      ...data,
      recentCompletions: envelope.data,
    }), onSettled);
    this.loadField(loadId, 'trend', this.api.getCompletionTrend(days), (data, envelope) => ({ ...data, trend: envelope.data }), onSettled);
    this.loadField(loadId, 'topProjects', this.api.getTopProjects(days, 8), (data, envelope) => ({
      ...data,
      topProjects: envelope.data,
    }), onSettled);
    this.loadField(loadId, 'topStudentsByLevel', this.api.getTopStudents('level', 8), (data, envelope) => ({
      ...data,
      topStudentsByLevel: envelope.data,
    }), onSettled);
    this.loadField(
      loadId,
      'topStudentsByCompletedProjects',
      this.api.getTopStudents('completedProjects', 8),
      (data, envelope) => ({ ...data, topStudentsByCompletedProjects: envelope.data }),
      onSettled,
    );
    this.loadField(loadId, 'livePulse', this.api.getLivePulse(), (data, envelope) => ({ ...data, livePulse: envelope.data }), onSettled);
    this.loadField(loadId, 'coalitions', this.api.getCoalitions(), (data, envelope) => ({
      ...data,
      coalitions: envelope.data,
    }), onSettled);
    this.loadField(loadId, 'evaluations', this.api.getEvaluations(), (data, envelope) => ({
      ...data,
      evaluations: envelope.data,
    }), onSettled);
    this.loadField(loadId, 'weeklyCampusActivity', this.api.getWeeklyCampusActivity(), (data, envelope) => ({
      ...data,
      weeklyCampusActivity: envelope.data,
    }), onSettled);
    this.loadField(loadId, 'upcomingEvents', this.api.getUpcomingEvents(5), (data, envelope) => ({
      ...data,
      upcomingEvents: envelope.data,
    }), onSettled);
    this.loadField(loadId, 'clusterOccupancy', this.api.getClusterOccupancy(), (data, envelope) => ({
      ...data,
      clusterOccupancy: envelope.data,
    }), onSettled);
  }
}
