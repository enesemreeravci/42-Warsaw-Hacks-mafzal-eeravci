import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../utils/cache.js';

describe('TtlCache', () => {
  it('returns fresh data immediately without calling the loader again', async () => {
    const cache = new TtlCache<number>(10_000);
    const loader = vi.fn().mockResolvedValue(42);
    await cache.getOrLoad('k', loader);
    const result = await cache.getOrLoad('k', loader);
    expect(result).toEqual({ value: 42, status: 'fresh' });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('de-dupes concurrent loads for the same key', async () => {
    const cache = new TtlCache<number>(10_000);
    let resolveLoader: (v: number) => void = () => {};
    const loader = vi.fn().mockImplementation(() => new Promise<number>((resolve) => (resolveLoader = resolve)));

    const p1 = cache.getOrLoad('k', loader);
    const p2 = cache.getOrLoad('k', loader);
    resolveLoader(7);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.value).toBe(7);
    expect(r2.value).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('falls back to stale data when the loader throws after a prior success', async () => {
    const cache = new TtlCache<number>(1); // 1ms TTL so it goes stale almost immediately
    await cache.getOrLoad('k', () => Promise.resolve(1));
    await new Promise((r) => setTimeout(r, 5));

    const result = await cache.getOrLoad('k', () => Promise.reject(new Error('upstream down')));
    expect(result).toEqual({ value: 1, status: 'stale' });
  });

  it('rethrows when the loader fails and there is no cached fallback', async () => {
    const cache = new TtlCache<number>(10_000);
    await expect(cache.getOrLoad('k', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });

  it('invalidateAll clears every entry', async () => {
    const cache = new TtlCache<number>(10_000);
    await cache.getOrLoad('k', () => Promise.resolve(1));
    cache.invalidateAll();
    expect(cache.get('k')).toBeUndefined();
  });

  it('logs miss, hit, and in-flight-reused outcomes distinctly', async () => {
    const debug = vi.fn();
    const cache = new TtlCache<number>(10_000, { debug });
    let resolveLoader: (v: number) => void = () => {};
    const loader = vi.fn().mockImplementation(() => new Promise<number>((resolve) => (resolveLoader = resolve)));

    const first = cache.getOrLoad('k', loader); // miss
    const concurrent = cache.getOrLoad('k', loader); // in-flight-reused
    resolveLoader(1);
    await Promise.all([first, concurrent]);

    await cache.getOrLoad('k', loader); // hit (fresh, within TTL)

    const cacheStates = debug.mock.calls.map(([entry]) => entry.cache);
    expect(cacheStates).toEqual(['miss', 'in-flight-reused', 'hit']);
  });
});
