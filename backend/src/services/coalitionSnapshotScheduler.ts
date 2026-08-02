import type { Logger } from '../config/logger.js';
import type { DataService } from './dataService.js';

// Coalition score moves slowly enough (peer evaluations, project validations) that snapshotting
// this often is already generous - the goal is just to accumulate enough real history points
// for a 7/14/30-day delta, not to track intraday movement.
const SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Periodically captures a coalition score snapshot (see DataService.captureCoalitionScoreSnapshot()
 * / CoalitionSnapshotStore) so Weekly Top Coalition Contributors has real history to compute a
 * "points earned during period" delta from. Mirrors BackgroundRefreshService's timer pattern.
 */
export class CoalitionSnapshotScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private cycleRunning = false;

  constructor(
    private readonly dataService: DataService,
    private readonly logger: Logger,
  ) {}

  /** Takes one snapshot immediately (so history starts accumulating from server boot) without
   * blocking startup - failures are logged, never thrown, matching BackgroundRefreshService.warmup(). */
  warmup(): void {
    void this.runCycle();
  }

  start(): void {
    this.timer = setInterval(() => void this.runCycle(), SNAPSHOT_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runCycle(): Promise<void> {
    if (this.cycleRunning) return;
    this.cycleRunning = true;
    try {
      await this.dataService.captureCoalitionScoreSnapshot();
    } catch (error) {
      this.logger.warn({ err: error }, 'Coalition score snapshot cycle failed; will retry next interval');
    } finally {
      this.cycleRunning = false;
    }
  }
}
