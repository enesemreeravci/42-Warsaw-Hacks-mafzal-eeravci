import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, filter, forkJoin, of, switchMap, tap, timer } from 'rxjs';
import type {
  AppConfigResponse,
  CompletionTrendPoint,
  DashboardSummary,
  Ft42Status,
  LivePulseResponse,
  ProjectCompletion,
  ProjectMetric,
  StudentDetail,
  StudentRanking,
} from '../models/api.models';
import type { NormalizedApiError } from '../interceptors/error.interceptor';
import { ApiService } from './api.service';
import { VisibilityService } from './visibility.service';

const DEFAULT_AUTO_REFRESH_SECONDS = 300;
const STATUS_POLL_MS = 60_000;

export interface DashboardData {
  summary: DashboardSummary | null;
  recentCompletions: ProjectCompletion[];
  trend: CompletionTrendPoint[];
  topProjects: ProjectMetric[];
  topStudentsByLevel: StudentRanking[];
  topStudentsByCompletedProjects: StudentRanking[];
  featuredStudent: StudentDetail | null;
  livePulse: LivePulseResponse | null;
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

  private readonly dataSignal = signal<DashboardData>({
    summary: null,
    recentCompletions: [],
    trend: [],
    topProjects: [],
    topStudentsByLevel: [],
    topStudentsByCompletedProjects: [],
    featuredStudent: null,
    livePulse: null,
  });

  private readonly loadingSignal = signal(true);
  private readonly refreshingSignal = signal(false);
  private readonly errorSignal = signal<NormalizedApiError | null>(null);
  private readonly staleSignal = signal(false);
  private readonly lastSuccessfulUpdateSignal = signal<Date | null>(null);
  private readonly lastFailedUpdateSignal = signal<Date | null>(null);
  private readonly autoRefreshEnabledSignal = signal(true);
  private readonly autoRefreshIntervalSecondsSignal = signal(DEFAULT_AUTO_REFRESH_SECONDS);
  private readonly countdownSecondsSignal = signal(DEFAULT_AUTO_REFRESH_SECONDS);
  private readonly selectedPeriodDaysSignal = signal(30);
  private readonly configSignal = signal<AppConfigResponse | null>(null);
  private readonly ft42StatusSignal = signal<Ft42Status | null>(null);

  readonly data = this.dataSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly refreshing = this.refreshingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly stale = this.staleSignal.asReadonly();
  readonly lastSuccessfulUpdate = this.lastSuccessfulUpdateSignal.asReadonly();
  readonly lastFailedUpdate = this.lastFailedUpdateSignal.asReadonly();
  readonly autoRefreshEnabled = this.autoRefreshEnabledSignal.asReadonly();
  readonly autoRefreshIntervalSeconds = this.autoRefreshIntervalSecondsSignal.asReadonly();
  readonly countdownSeconds = this.countdownSecondsSignal.asReadonly();
  readonly selectedPeriodDays = this.selectedPeriodDaysSignal.asReadonly();
  readonly config = this.configSignal.asReadonly();
  readonly mockMode = computed(() => this.configSignal()?.mockMode ?? false);
  readonly ft42Status = this.ft42StatusSignal.asReadonly();

  private readonly manualRefresh$ = new Subject<void>();
  private isFetching = false;
  private initialized = false;

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

  private loadAll(): void {
    if (this.isFetching) return;
    this.isFetching = true;

    const hadDataBefore = this.dataSignal().summary !== null;
    if (hadDataBefore) {
      this.refreshingSignal.set(true);
    } else {
      this.loadingSignal.set(true);
    }

    const days = this.selectedPeriodDaysSignal();
    const featuredLogin = this.configSignal()?.featuredLogin ?? 'mafzal';

    forkJoin({
      summary: this.api.getDashboardSummary(),
      recentCompletions: this.api.getRecentCompletions(7, 20),
      trend: this.api.getCompletionTrend(days),
      topProjects: this.api.getTopProjects(days, 8),
      topStudentsByLevel: this.api.getTopStudents('level', 8),
      topStudentsByCompletedProjects: this.api.getTopStudents('completedProjects', 8),
      featuredStudent: this.api.getStudentDetail(featuredLogin).pipe(catchError(() => of(null))),
      livePulse: this.api.getLivePulse().pipe(catchError(() => of(null))),
    })
      .pipe(
        tap(() => {
          this.isFetching = false;
        }),
        catchError((err: NormalizedApiError) => {
          this.isFetching = false;
          this.loadingSignal.set(false);
          this.refreshingSignal.set(false);
          this.errorSignal.set(err);
          this.lastFailedUpdateSignal.set(new Date());
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (!result) return;

        this.dataSignal.set({
          summary: result.summary.data,
          recentCompletions: result.recentCompletions.data,
          trend: result.trend.data,
          topProjects: result.topProjects.data,
          topStudentsByLevel: result.topStudentsByLevel.data,
          topStudentsByCompletedProjects: result.topStudentsByCompletedProjects.data,
          featuredStudent: result.featuredStudent?.data ?? null,
          livePulse: result.livePulse?.data ?? null,
        });

        this.staleSignal.set(Boolean(result.summary.meta.staleData));
        this.errorSignal.set(null);
        this.loadingSignal.set(false);
        this.refreshingSignal.set(false);
        this.lastSuccessfulUpdateSignal.set(new Date());
      });
  }
}
