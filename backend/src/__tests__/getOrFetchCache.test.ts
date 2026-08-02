import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearFetchCache, getOrFetchCache } from '../utils/cache.js';

describe('getOrFetchCache', () => {
  afterEach(() => {
    clearFetchCache();
    vi.useRealTimers();
  });

  it('cache miss triggers the external fetch and stores the result', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ id: 1 });

    const result = await getOrFetchCache('miss-key', fetchFn);

    expect(result).toEqual({ id: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a call within the 7-minute (420s) TTL returns the cached payload without re-fetching', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValue('first-value');

    const first = await getOrFetchCache('within-ttl-key', fetchFn);
    vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes - comfortably inside the 7-minute TTL
    const second = await getOrFetchCache('within-ttl-key', fetchFn);

    expect(first).toBe('first-value');
    expect(second).toBe('first-value');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a call after the 7-minute (420s) TTL has elapsed re-triggers the external fetch', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValueOnce('first-value').mockResolvedValueOnce('second-value');

    const first = await getOrFetchCache('past-ttl-key', fetchFn);
    vi.advanceTimersByTime(8 * 60 * 1000); // 8 minutes - past the 7-minute TTL
    const second = await getOrFetchCache('past-ttl-key', fetchFn);

    expect(first).toBe('first-value');
    expect(second).toBe('second-value');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('honors the exact 420-second boundary: cached at 419s, expired by 421s', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValueOnce('first-value').mockResolvedValueOnce('second-value');

    await getOrFetchCache('boundary-key', fetchFn);
    vi.advanceTimersByTime(419_000);
    const stillCached = await getOrFetchCache('boundary-key', fetchFn);
    vi.advanceTimersByTime(2_000); // now 421s total
    const refetched = await getOrFetchCache('boundary-key', fetchFn);

    expect(stillCached).toBe('first-value');
    expect(refetched).toBe('second-value');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('respects a custom ttlSeconds override instead of the 420s default', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockResolvedValueOnce('first-value').mockResolvedValueOnce('second-value');

    await getOrFetchCache('custom-ttl-key', fetchFn, 30);
    vi.advanceTimersByTime(31_000); // past the custom 30s TTL, well under the 420s default
    const result = await getOrFetchCache('custom-ttl-key', fetchFn, 30);

    expect(result).toBe('second-value');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('de-dupes concurrent calls for the same key into a single upstream fetch', async () => {
    let resolveFetch: (value: string) => void = () => {};
    const fetchFn = vi.fn().mockImplementation(() => new Promise<string>((resolve) => (resolveFetch = resolve)));

    const p1 = getOrFetchCache('concurrent-key', fetchFn);
    const p2 = getOrFetchCache('concurrent-key', fetchFn);
    resolveFetch('shared-value');
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe('shared-value');
    expect(r2).toBe('shared-value');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('different keys are cached independently', async () => {
    const fetchA = vi.fn().mockResolvedValue('a-value');
    const fetchB = vi.fn().mockResolvedValue('b-value');

    const a = await getOrFetchCache('key-a', fetchA);
    const b = await getOrFetchCache('key-b', fetchB);

    expect(a).toBe('a-value');
    expect(b).toBe('b-value');
    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(fetchB).toHaveBeenCalledTimes(1);
  });
});
