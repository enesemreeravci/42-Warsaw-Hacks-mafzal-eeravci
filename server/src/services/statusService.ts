import type { Logger } from '../config/logger.js';
import type { Ft42ApiClient } from './ft42ApiClient.js';
import type { TokenManager } from './tokenManager.js';

export interface Ft42Status {
  reachable: boolean;
  responseTimeMs: number | null;
  authenticated: boolean;
  lastSuccessfulRequestAt: string | null;
  lastErrorSummary: string | null;
}

/**
 * Lightweight upstream health probe backing GET /api/status/42. Never
 * surfaces tokens/secrets - only booleans, timings, and short error text.
 *
 * The live probe (`refresh()`) is only ever called by BackgroundRefreshService on its own
 * timer - route handlers call `getSnapshot()` instead, which never awaits a live 42 API call.
 * Previously the route awaited `check()` directly on every request, so this probe's live round
 * trip (and any queueing behind other in-flight 42 API traffic sharing the same rate limiter)
 * landed on every dashboard status poll; multi-second responses were the direct result.
 */
export class StatusService {
  private lastSuccessfulRequestAt: string | null = null;
  private lastErrorSummary: string | null = null;
  private cached: Ft42Status | null = null;

  constructor(
    private readonly apiClient: Ft42ApiClient,
    private readonly tokenManager: TokenManager,
    private readonly logger: Logger,
  ) {}

  /** Cache-only read - returns a benign placeholder until the first refresh() completes. */
  getSnapshot(): Ft42Status {
    return (
      this.cached ?? {
        reachable: false,
        responseTimeMs: null,
        authenticated: this.tokenManager.getStatus().authenticated,
        lastSuccessfulRequestAt: null,
        lastErrorSummary: 'Status check has not completed yet.',
      }
    );
  }

  async refresh(): Promise<Ft42Status> {
    const start = Date.now();
    try {
      await this.apiClient.get('/v2/campus', { 'page[size]': 1 });
      this.lastSuccessfulRequestAt = new Date().toISOString();
      this.lastErrorSummary = null;
      this.cached = {
        reachable: true,
        responseTimeMs: Date.now() - start,
        authenticated: this.tokenManager.getStatus().authenticated,
        lastSuccessfulRequestAt: this.lastSuccessfulRequestAt,
        lastErrorSummary: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error contacting 42 API';
      this.lastErrorSummary = message;
      this.logger.warn({ err: message }, '42 API status probe failed');
      this.cached = {
        reachable: false,
        responseTimeMs: Date.now() - start,
        authenticated: this.tokenManager.getStatus().authenticated,
        lastSuccessfulRequestAt: this.lastSuccessfulRequestAt,
        lastErrorSummary: message,
      };
    }
    return this.cached;
  }
}
