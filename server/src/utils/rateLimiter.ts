export interface RateLimiterOptions {
  /** Minimum time between the start of two dispatched tasks. */
  minIntervalMs: number;
  /** Rejects new work once this many tasks are waiting, instead of queueing unboundedly. */
  maxQueueSize?: number;
}

interface QueueItem<T> {
  task: (queueWaitMs: number) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  enqueuedAt: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Global leaky-bucket pacer. A single instance is shared by every outbound 42 API request
 * (every service goes through the one `Ft42ApiClient`), so no combination of concurrently
 * loading datasets can exceed `minIntervalMs` between request starts - each loader awaiting
 * its own pages sequentially isn't enough on its own, because several independent loaders
 * (core dataset, coalitions, scale_teams) can legitimately run concurrently and each fire
 * requests as fast as the network allows.
 */
export class RateLimiter {
  private readonly queue: QueueItem<unknown>[] = [];
  private lastDispatchAt = 0;
  private draining = false;
  private closed = false;

  constructor(private readonly options: RateLimiterOptions) {}

  get pending(): number {
    return this.queue.length;
  }

  schedule<T>(task: (queueWaitMs: number) => Promise<T>): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error('Rate limiter is closed'));
    }
    if (this.queue.length >= (this.options.maxQueueSize ?? 500)) {
      return Promise.reject(new Error('42 API request queue is full'));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task: task as (queueWaitMs: number) => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
      });
      void this.drain();
    });
  }

  /** Rejects every queued-but-not-yet-started task so shutdown never leaves dangling promises. In-flight tasks still settle naturally. */
  close(): void {
    this.closed = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item?.reject(new Error('Rate limiter closed before this request started'));
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const waitMs = Math.max(0, this.options.minIntervalMs - (Date.now() - this.lastDispatchAt));
        if (waitMs > 0) await sleep(waitMs);

        const item = this.queue.shift();
        if (!item) break;

        this.lastDispatchAt = Date.now();
        const queueWaitMs = this.lastDispatchAt - item.enqueuedAt;

        // A rejected task must not stop the queue from processing what's behind it.
        try {
          item.resolve(await item.task(queueWaitMs));
        } catch (error) {
          item.reject(error);
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
