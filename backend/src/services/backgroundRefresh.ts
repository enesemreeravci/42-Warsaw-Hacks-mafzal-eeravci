import type { Logger } from '../config/logger.js';
import type { DataService } from './dataService.js';
import type { StatusService } from './statusService.js';

// The "core" cycle covers everything the auto-loading dashboard reads: roster + recent
// completions + coalitions + evaluations. All bounded/fast loaders, so this interval can be
// short. cacheTtlSeconds (default 420s / 7min) must stay comfortably above this so a cache entry
// is always refreshed well before it would expire under getOrLoad()'s own TTL.
const CORE_REFRESH_INTERVAL_MS = 45_000;
// The historical dataset pages the full, unbounded project-completion history (100+ pages) -
// expensive enough that refreshing it this often would itself saturate the 42 API rate limit,
// so it gets a much longer interval. Read by /students and /students/:login.
const HISTORICAL_REFRESH_INTERVAL_MS = 6 * 60_000;
// GET /api/status/42 used to run this probe live on every request; the frontend polls it every
// 60s (see DashboardStore's STATUS_POLL_MS), so refreshing comfortably faster than that keeps
// the cached snapshot always fresher than what any client would notice.
const STATUS_REFRESH_INTERVAL_MS = 30_000;

export interface BackgroundRefreshStatus {
  lastCoreSuccessAt: string | null;
  lastCoreError: string | null;
  lastHistoricalSuccessAt: string | null;
  lastHistoricalError: string | null;
}

/**
 * Proactively keeps DataService's cache warm so no client GET request ever waits on a live
 * 42 API call - it just calls the same cached loaders every route already used to call inline.
 * A failed cycle never throws past this class: DataService's TtlCache falls back to the
 * previous cached value on its own, and this class additionally records the error so route
 * handlers can distinguish "still warming up" from "upstream is actually broken" without ever
 * making a live call themselves.
 */
export class BackgroundRefreshService {
  private coreTimer: ReturnType<typeof setInterval> | null = null;
  private historicalTimer: ReturnType<typeof setInterval> | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private coreCycleRunning = false;
  private historicalCycleRunning = false;
  private statusCycleRunning = false;

  private lastCoreSuccessAt: string | null = null;
  private lastCoreError: string | null = null;
  private lastHistoricalSuccessAt: string | null = null;
  private lastHistoricalError: string | null = null;

  constructor(
    private readonly dataService: DataService,
    private readonly statusService: StatusService,
    private readonly logger: Logger,
  ) {}

  /** Runs one of each cycle and resolves once both are done. Never awaited by server startup
   * itself: the 42 API's retry/backoff (which honors its own Retry-After header - seen live as
   * 129s after a 429) means this can legitimately take minutes even though it never rejects, and
   * blocking app.listen() on it would make the whole server unreachable for that window. Tests
   * that use fixture data (instant, no real network) can safely await it directly instead.
   *
   * Deliberately excludes the status probe: core+historical already saturate the shared rate
   * limiter's request budget during this exact cold-start window (this is when 429-with-backoff
   * is most likely to fire), and status is the lowest-priority of the three - getSnapshot()
   * already degrades to a harmless placeholder, so it's fine for its first real value to arrive
   * a little later via its own recurring timer instead of competing for a slot right now. */
  async warmup(): Promise<void> {
    await Promise.all([this.runCoreCycle(), this.runHistoricalCycle()]);
  }

  /** Starts the recurring background timers. Call after warmup() so the first tick isn't a duplicate. */
  start(): void {
    this.coreTimer = setInterval(() => void this.runCoreCycle(), CORE_REFRESH_INTERVAL_MS);
    this.historicalTimer = setInterval(() => void this.runHistoricalCycle(), HISTORICAL_REFRESH_INTERVAL_MS);
    this.statusTimer = setInterval(() => void this.runStatusCycle(), STATUS_REFRESH_INTERVAL_MS);
  }

  stop(): void {
    if (this.coreTimer) clearInterval(this.coreTimer);
    if (this.historicalTimer) clearInterval(this.historicalTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.coreTimer = null;
    this.historicalTimer = null;
    this.statusTimer = null;
  }

  getStatus(): BackgroundRefreshStatus {
    return {
      lastCoreSuccessAt: this.lastCoreSuccessAt,
      lastCoreError: this.lastCoreError,
      lastHistoricalSuccessAt: this.lastHistoricalSuccessAt,
      lastHistoricalError: this.lastHistoricalError,
    };
  }

  private async runCoreCycle(): Promise<void> {
    if (this.coreCycleRunning) return;
    this.coreCycleRunning = true;
    const start = Date.now();
    try {
      await this.dataService.getCoreDataset();
      await this.dataService.getCoalitions();
      await this.dataService.getRecentEvaluations(20); // matches the largest `limit` GET /dashboard/evaluations accepts
      this.lastCoreSuccessAt = new Date().toISOString();
      this.lastCoreError = null;
      this.logger.info({ durationMs: Date.now() - start }, 'Background refresh: core cache warmed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error refreshing core dashboard cache';
      this.lastCoreError = message;
      this.logger.warn({ err: message, durationMs: Date.now() - start }, 'Background refresh: core cycle failed, previous cache (if any) kept');
    } finally {
      this.coreCycleRunning = false;
    }
  }

  private async runHistoricalCycle(): Promise<void> {
    if (this.historicalCycleRunning) return;
    this.historicalCycleRunning = true;
    const start = Date.now();
    try {
      await this.dataService.getHistoricalCoreDataset();
      this.lastHistoricalSuccessAt = new Date().toISOString();
      this.lastHistoricalError = null;
      this.logger.info({ durationMs: Date.now() - start }, 'Background refresh: historical cache warmed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error refreshing historical student cache';
      this.lastHistoricalError = message;
      this.logger.warn(
        { err: message, durationMs: Date.now() - start },
        'Background refresh: historical cycle failed, previous cache (if any) kept',
      );
    } finally {
      this.historicalCycleRunning = false;
    }
  }

  /** Keeps StatusService's cached snapshot warm so GET /api/status/42 never awaits a live probe
   * itself - see StatusService.getSnapshot()/refresh(). StatusService.refresh() never throws
   * (it captures the failure into the snapshot instead), so this has no error path of its own. */
  private async runStatusCycle(): Promise<void> {
    if (this.statusCycleRunning) return;
    this.statusCycleRunning = true;
    try {
      await this.statusService.refresh();
    } finally {
      this.statusCycleRunning = false;
    }
  }
}
