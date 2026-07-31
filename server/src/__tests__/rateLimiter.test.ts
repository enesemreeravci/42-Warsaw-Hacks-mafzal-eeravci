import { describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../utils/rateLimiter.js';

describe('RateLimiter', () => {
  it('never starts more than one task per minIntervalMs, even when scheduled in a burst', async () => {
    vi.useFakeTimers();
    try {
      const limiter = new RateLimiter({ minIntervalMs: 600 });
      const startTimes: number[] = [];

      const results = Promise.all(
        Array.from({ length: 5 }, () =>
          limiter.schedule(async () => {
            startTimes.push(Date.now());
            return 'ok';
          }),
        ),
      );

      await vi.runAllTimersAsync();
      await results;

      expect(startTimes).toHaveLength(5);
      for (let i = 1; i < startTimes.length; i += 1) {
        expect(startTimes[i]! - startTimes[i - 1]!).toBeGreaterThanOrEqual(600);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets queued work continue after an earlier task fails', async () => {
    vi.useFakeTimers();
    try {
      const limiter = new RateLimiter({ minIntervalMs: 600 });

      const failing = limiter.schedule(async () => {
        throw new Error('boom');
      });
      // Attach rejection handlers in the same tick the promises are created, so the brief
      // window before `runAllTimersAsync` flushes them never looks like an unhandled rejection.
      const failingAssertion = expect(failing).rejects.toThrow('boom');
      const succeeding = limiter.schedule(async () => 'still works');
      const succeedingAssertion = expect(succeeding).resolves.toBe('still works');

      await vi.runAllTimersAsync();

      await failingAssertion;
      await succeedingAssertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects new work once the queue is at its configured maximum size', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 10_000, maxQueueSize: 1 });

    // First call starts immediately (queue empties as it's dispatched); keep a second one
    // pending so the queue is genuinely occupied when the third call arrives.
    const blocker = new Promise<void>(() => undefined);
    void limiter.schedule(() => blocker);
    void limiter.schedule(async () => 'queued');

    await expect(limiter.schedule(async () => 'overflow')).rejects.toThrow(/queue is full/);
  });

  it('rejects queued-but-not-started work on close(), without touching in-flight work', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 10_000 });

    const inFlight = limiter.schedule(async () => 'first');
    const queued = limiter.schedule(async () => 'second');

    limiter.close();

    await expect(inFlight).resolves.toBe('first');
    await expect(queued).rejects.toThrow(/closed/);
  });
});
