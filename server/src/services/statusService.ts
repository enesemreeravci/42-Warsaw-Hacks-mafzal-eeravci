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
 * Lightweight upstream health probe used by GET /api/status/42. Never
 * surfaces tokens/secrets - only booleans, timings, and short error text.
 */
export class StatusService {
  private lastSuccessfulRequestAt: string | null = null;
  private lastErrorSummary: string | null = null;

  constructor(
    private readonly mockMode: boolean,
    private readonly apiClient: Ft42ApiClient | null,
    private readonly tokenManager: TokenManager | null,
    private readonly logger: Logger,
  ) {}

  async check(): Promise<Ft42Status> {
    if (this.mockMode) {
      return {
        reachable: true,
        responseTimeMs: 0,
        authenticated: true,
        lastSuccessfulRequestAt: new Date().toISOString(),
        lastErrorSummary: null,
      };
    }

    const start = Date.now();
    try {
      await this.apiClient!.get('/v2/campus', { 'page[size]': 1 });
      this.lastSuccessfulRequestAt = new Date().toISOString();
      this.lastErrorSummary = null;
      return {
        reachable: true,
        responseTimeMs: Date.now() - start,
        authenticated: this.tokenManager!.getStatus().authenticated,
        lastSuccessfulRequestAt: this.lastSuccessfulRequestAt,
        lastErrorSummary: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error contacting 42 API';
      this.lastErrorSummary = message;
      this.logger.warn({ err: message }, '42 API status probe failed');
      return {
        reachable: false,
        responseTimeMs: Date.now() - start,
        authenticated: this.tokenManager!.getStatus().authenticated,
        lastSuccessfulRequestAt: this.lastSuccessfulRequestAt,
        lastErrorSummary: message,
      };
    }
  }
}
