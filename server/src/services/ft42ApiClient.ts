import axios, { type AxiosInstance, type AxiosRequestConfig, AxiosError } from 'axios';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
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
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;
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

/**
 * Thin, resilient wrapper around the 42 API v2. Centralizes auth injection,
 * retry/backoff, and pagination so route handlers never talk to axios directly.
 */
export class Ft42ApiClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: Pick<AppConfig, 'ft42ApiBaseUrl'>,
    private readonly tokenManager: TokenManager,
    private readonly logger: Logger,
    httpClient?: AxiosInstance,
  ) {
    this.http = httpClient ?? axios.create({ baseURL: config.ft42ApiBaseUrl, timeout: DEFAULT_TIMEOUT_MS });
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

    try {
      const response = await this.http.get<T>(path, {
        ...options,
        params,
        headers: { ...(options?.headers ?? {}), Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      if (!(error instanceof AxiosError)) {
        throw new Ft42ApiError('Unexpected error calling 42 API', undefined, 'UNKNOWN_ERROR');
      }

      const status = error.response?.status;

      // Ordinary 400/404 are not retried - they represent a real client-side error.
      if (status === 400 || status === 404) {
        throw new Ft42ApiError(`42 API request failed (${status})`, status, status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST');
      }

      if (status === 401 && !hasRetriedAuth) {
        this.logger.warn({ path }, '42 API returned 401, invalidating cached token and retrying once');
        this.tokenManager.invalidate();
        return this.requestWithRetry<T>(path, params, options, attempt, true);
      }

      if (isRetryable(status) && attempt < MAX_RETRIES) {
        const retryAfterHeader = error.response?.headers?.['retry-after'];
        const retryAfterMs = retryAfterHeader ? Number.parseInt(String(retryAfterHeader), 10) * 1000 : undefined;
        const backoffMs = retryAfterMs ?? Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
        this.logger.warn({ path, status, attempt, backoffMs }, '42 API request failed, retrying with backoff');
        await sleep(backoffMs);
        return this.requestWithRetry<T>(path, params, options, attempt + 1, hasRetriedAuth);
      }

      this.logger.error({ path, status }, '42 API request failed permanently');
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
