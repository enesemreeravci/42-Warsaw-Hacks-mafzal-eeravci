import axios, { type AxiosInstance, type AxiosRequestConfig, AxiosError } from 'axios';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import type { TokenManager } from './tokenManager.js';

export class Ft42ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | undefined,
    public readonly code: string,
  ) {
    super(message);
  }
}

const MAX_RETRIES = 3;
// The 42 API allows ~2 req/s; 600ms keeps every request (across every service, since they
// all share one Ft42ApiClient/RateLimiter) safely under that instead of right at the edge.
const MIN_REQUEST_INTERVAL_MS = 600;
// First retry ~2s, second ~4s, third ~8s (capped) - fast enough to still recover promptly,
// slow enough that a retry doesn't land inside the same rate-limit window that caused the 429.
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 8_000;
const BACKOFF_JITTER_MS = 300;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 20;

export interface PaginationOptions {
  pageSize?: number;
  maxPages?: number;
  /** Stop once a page's records are all older than this date (records assumed newest-first). */
  stopBeforeDate?: Date;
  extractDate?: (item: unknown) => string | undefined;
  maxItems?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number | undefined): boolean {
  if (status === undefined) return true; // network/timeout error
  return status === 429 || status >= 500;
}

/** `Retry-After` is either a whole number of seconds or an HTTP-date; either form is legal. */
function parseRetryAfterMs(header: string | undefined): number | undefined {
  if (!header) return undefined;

  const seconds = Number.parseInt(header, 10);
  if (!Number.isNaN(seconds) && String(seconds) === header.trim()) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

/**
 * Thin, resilient wrapper around the 42 API v2. Centralizes auth injection,
 * retry/backoff, and pagination so route handlers never talk to axios directly.
 */
export class Ft42ApiClient {
  private readonly http: AxiosInstance;
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly config: Pick<AppConfig, 'ft42ApiBaseUrl'>,
    private readonly tokenManager: TokenManager,
    private readonly logger: Logger,
    httpClient?: AxiosInstance,
    rateLimiter?: RateLimiter,
  ) {
    this.http = httpClient ?? axios.create({ baseURL: config.ft42ApiBaseUrl, timeout: DEFAULT_TIMEOUT_MS });
    // Shared across every call this client makes (get/paginate, from every service, including
    // retries) - this is the one chokepoint all 42 API traffic passes through, so instantiating
    // the limiter here (rather than per-service) is what makes it a true global limit.
    this.rateLimiter = rateLimiter ?? new RateLimiter({ minIntervalMs: MIN_REQUEST_INTERVAL_MS });
  }

  async get<T>(path: string, params?: Record<string, unknown>, options?: AxiosRequestConfig): Promise<T> {
    return this.requestWithRetry<T>(path, params, options, 0, false);
  }

  private async requestWithRetry<T>(
    path: string,
    params: Record<string, unknown> | undefined,
    options: AxiosRequestConfig | undefined,
    attempt: number,
    hasRetriedAuth: boolean,
  ): Promise<T> {
    const token = await this.tokenManager.getAccessToken();
    const start = Date.now();

    try {
      const response = await this.rateLimiter.schedule((queueWaitMs) => {
        this.logger.debug({ path, attempt, queueWaitMs }, '42 API request dispatched');
        return this.http.get<T>(path, {
          ...options,
          params,
          headers: { ...(options?.headers ?? {}), Authorization: `Bearer ${token}` },
        });
      });

      const records = Array.isArray(response.data) ? response.data.length : undefined;
      this.logger.debug({ path, attempt, status: response.status, records, durationMs: Date.now() - start }, '42 API request succeeded');
      return response.data;
    } catch (error) {
      if (!(error instanceof AxiosError)) {
        throw new Ft42ApiError('Unexpected error calling 42 API', undefined, 'UNKNOWN_ERROR');
      }

      const status = error.response?.status;
      const durationMs = Date.now() - start;

      // Ordinary 400/404 are not retried - they represent a real client-side error.
      if (status === 400 || status === 404) {
        this.logger.warn({ path, status, durationMs }, '42 API request rejected (client error, not retried)');
        throw new Ft42ApiError(`42 API request failed (${status})`, status, status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST');
      }

      if (status === 401 && !hasRetriedAuth) {
        this.logger.warn({ path, durationMs }, '42 API returned 401, invalidating cached token and retrying once');
        this.tokenManager.invalidate();
        return this.requestWithRetry<T>(path, params, options, attempt, true);
      }

      if (isRetryable(status) && attempt < MAX_RETRIES) {
        // 429 is a rate-limit signal, not an auth failure - the token stays cached and valid;
        // only the request is paced/retried. Never call tokenManager.invalidate() here.
        const retryAfterHeader = error.response?.headers?.['retry-after'];
        const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
        const jitterMs = Math.floor(Math.random() * BACKOFF_JITTER_MS);
        const backoffMs = retryAfterMs ?? Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS) + jitterMs;
        this.logger.warn(
          { path, status, attempt, durationMs, retryAfter: retryAfterHeader ?? null, backoffMs },
          '42 API request failed, retrying with backoff',
        );
        await sleep(backoffMs);
        return this.requestWithRetry<T>(path, params, options, attempt + 1, hasRetriedAuth);
      }

      this.logger.error({ path, status, attempt, durationMs }, '42 API request failed permanently');
      throw new Ft42ApiError(`42 API request failed (${status ?? 'network error'})`, status, 'FT42_UPSTREAM_ERROR');
    }
  }

  /**
   * Generic offset-page paginator. Continues until a page comes back short
   * (last page), maxPages/maxItems is hit, or all items on a page are older
   * than stopBeforeDate. Always bounded by maxPages to avoid unbounded loops.
   */
  async paginate<T>(path: string, params: Record<string, unknown>, options: PaginationOptions = {}): Promise<T[]> {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    const results: T[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const items = await this.get<T[]>(path, {
        ...params,
        'page[size]': pageSize,
        'page[number]': page,
      });

      this.logger.debug({ path, page, count: Array.isArray(items) ? items.length : 0 }, '42 API page fetched');

      if (!Array.isArray(items) || items.length === 0) {
        break;
      }

      results.push(...items);

      if (options.maxItems && results.length >= options.maxItems) {
        return results.slice(0, options.maxItems);
      }

      if (options.stopBeforeDate && options.extractDate) {
        const allOlder = items.every((item) => {
          const dateStr = options.extractDate?.(item);
          return dateStr ? new Date(dateStr) < options.stopBeforeDate! : false;
        });
        if (allOlder) break;
      }

      if (items.length < pageSize) {
        break; // last page
      }
    }

    return results;
  }
}
