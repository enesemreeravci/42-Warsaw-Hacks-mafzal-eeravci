import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import { RateLimiter } from '../utils/rateLimiter.js';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
});

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export class TokenAcquisitionError extends Error {}

const EARLY_EXPIRY_BUFFER_MS = 60_000;

/**
 * Owns the OAuth Client Credentials token lifecycle. The token itself never
 * leaves this class - only a sanitized status is ever exposed to callers.
 */
export class TokenManager {
  private cached: CachedToken | null = null;
  private refreshPromise: Promise<CachedToken> | null = null;
  private lastError: string | null = null;
  private lastSuccessAt: string | null = null;
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: Pick<AppConfig, 'ft42ApiBaseUrl' | 'ft42ClientId' | 'ft42ClientSecret'>,
    private readonly logger: Logger,
    httpClient?: AxiosInstance,
    private readonly rateLimiter: RateLimiter = new RateLimiter({ minIntervalMs: 600 }),
  ) {
    this.http = httpClient ?? axios.create({ baseURL: config.ft42ApiBaseUrl, timeout: 10_000 });
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt - EARLY_EXPIRY_BUFFER_MS) {
      return this.cached.accessToken;
    }
    const token = await this.refresh();
    return token.accessToken;
  }

  /** Called by the API client after a 401 so the next attempt gets a fresh token. */
  invalidate(): void {
    this.cached = null;
  }

  getStatus(): { authenticated: boolean; lastSuccessAt: string | null; lastError: string | null } {
    return {
      authenticated: this.cached !== null && Date.now() < this.cached.expiresAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
    };
  }

  private async refresh(): Promise<CachedToken> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.requestNewToken().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async requestNewToken(): Promise<CachedToken> {
    if (!this.config.ft42ClientId || !this.config.ft42ClientSecret) {
      throw new TokenAcquisitionError('42 API credentials are not configured.');
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.ft42ClientId,
        client_secret: this.config.ft42ClientSecret,
      });

      const response = await this.rateLimiter.schedule(() =>
        this.http.post('/oauth/token', body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      const parsed = tokenResponseSchema.safeParse(response.data);
      if (!parsed.success) {
        throw new TokenAcquisitionError('Malformed token response from 42 API.');
      }

      const token: CachedToken = {
        accessToken: parsed.data.access_token,
        expiresAt: Date.now() + parsed.data.expires_in * 1000,
      };

      this.cached = token;
      this.lastSuccessAt = new Date().toISOString();
      this.lastError = null;
      this.logger.info('Acquired new 42 API access token'); // never log the token value itself
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown token acquisition error';
      this.lastError = message;
      this.logger.error({ err: sanitizeAxiosError(error) }, 'Failed to acquire 42 API access token');
      throw new TokenAcquisitionError(message);
    }
  }
}

/** Strips response bodies/headers (which could echo request params) before logging. */
function sanitizeAxiosError(error: unknown): { message: string; status?: number } {
  if (axios.isAxiosError(error)) {
    return { message: error.message, status: error.response?.status };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}
