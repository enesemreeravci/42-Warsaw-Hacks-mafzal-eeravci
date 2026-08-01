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
