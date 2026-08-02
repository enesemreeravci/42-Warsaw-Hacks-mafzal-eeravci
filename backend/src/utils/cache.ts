interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  storedAt: number;
}

export interface CacheGetResult<T> {
  value: T;
  status: 'fresh' | 'stale';
}

export interface CacheLogger {
  debug(obj: Record<string, unknown>, msg: string): void;
}

/**
 * TTL cache with stale-on-error fallback and in-flight request de-duplication
 * (a "cache stampede" guard) so concurrent callers share one upstream load.
 */
export class TtlCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly defaultTtlMs: number,
    private readonly logger?: CacheLogger,
  ) {}

  get(key: string): CacheGetResult<T> | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    return { value: entry.value, status: Date.now() < entry.expiresAt ? 'fresh' : 'stale' };
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs, storedAt: Date.now() });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidateAll(): void {
    this.store.clear();
  }

  /**
   * Load-through helper: serves fresh cache immediately, de-dupes concurrent
   * loads for the same key, and falls back to stale data if the loader throws.
   */
  async getOrLoad(key: string, loader: () => Promise<T>, ttlMs = this.defaultTtlMs): Promise<CacheGetResult<T>> {
    const cached = this.get(key);
    if (cached && cached.status === 'fresh') {
      this.logger?.debug({ key, cache: 'hit' }, 'cache lookup');
      return cached;
    }

    const existingLoad = this.inFlight.get(key);
    if (existingLoad) {
      this.logger?.debug({ key, cache: 'in-flight-reused' }, 'cache lookup');
      const value = await existingLoad;
      return { value, status: 'fresh' };
    }

    this.logger?.debug({ key, cache: 'miss' }, 'cache lookup');
    const loadPromise = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, loadPromise);

    try {
      const value = await loadPromise;
      return { value, status: 'fresh' };
    } catch (error) {
      if (cached) {
        this.logger?.debug({ key, cache: 'stale-fallback' }, 'cache lookup');
        return { value: cached.value, status: 'stale' };
      }
      throw error;
    }
  }
}

/** 7 minutes - the default TTL for getOrFetchCache() below. */
export const DEFAULT_FETCH_CACHE_TTL_SECONDS = 420;

/** Backs getOrFetchCache() - one shared in-memory store for the process's lifetime. Being a
 * plain in-memory Map (via TtlCache), it's wiped automatically on every restart; nothing here is
 * ever persisted to disk, so there's no separate "clear on shutdown" step to implement. */
const fetchCache = new TtlCache<unknown>(DEFAULT_FETCH_CACHE_TTL_SECONDS * 1000);

/**
 * Minimal get-or-fetch cache helper for wrapping calls to slow/rate-limited external APIs:
 * returns the cached payload for `key` if it's still within its TTL; otherwise calls `fetchFn()`,
 * stores the result for `ttlSeconds` (default 420s / 7 minutes), and returns it. Concurrent calls
 * for the same key made while a fetch is already in flight share that one fetch rather than
 * triggering duplicate upstream requests (inherited from TtlCache.getOrLoad's in-flight
 * de-duplication, above).
 *
 * This is a thin, single-purpose wrapper - `DataService` (see services/dataService.ts) already
 * routes every dashboard/TV endpoint through its own TtlCache instance with per-feature TTLs
 * tuned to how fast each dataset actually changes (as little as 30s for live cluster occupancy,
 * up to 45min for slow-moving weekly rollups). Reach for this helper for new call sites that
 * genuinely want a flat, one-size-fits-all TTL instead.
 */
export async function getOrFetchCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = DEFAULT_FETCH_CACHE_TTL_SECONDS,
): Promise<T> {
  const result = await fetchCache.getOrLoad(key, fetchFn as () => Promise<unknown>, ttlSeconds * 1000);
  return result.value as T;
}

/** Test-only escape hatch for getOrFetchCache()'s shared store between test cases. */
export function clearFetchCache(): void {
  fetchCache.invalidateAll();
}
