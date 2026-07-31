import { AxiosError, type AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../config/logger.js';
import { Ft42ApiClient, Ft42ApiError } from '../services/ft42ApiClient.js';
import type { TokenManager } from '../services/tokenManager.js';

const silentLogger = createLogger({ logLevel: 'silent' });
const config = { ft42ApiBaseUrl: 'https://api.intra.42.fr' };

function fakeTokenManager(tokens: string[]): TokenManager {
  let call = 0;
  return {
    getAccessToken: vi.fn().mockImplementation(() => Promise.resolve(tokens[Math.min(call++, tokens.length - 1)]!)),
    invalidate: vi.fn(),
  } as unknown as TokenManager;
}

function axiosError(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`);
  error.response = { status, headers: {}, statusText: '', config: error.config!, data: undefined };
  return error;
}

describe('Ft42ApiClient', () => {
  it('invalidates the cached token and retries exactly once after a 401', async () => {
    vi.useFakeTimers();
    try {
      const tokenManager = fakeTokenManager(['tok-1', 'tok-2']);
      const get = vi.fn().mockRejectedValueOnce(axiosError(401)).mockResolvedValueOnce({ data: { ok: true } });
      const http = { get } as unknown as AxiosInstance;

      const client = new Ft42ApiClient(config, tokenManager, silentLogger, http);
      const pending = client.get('/v2/campus');
      const assertion = expect(pending).resolves.toEqual({ ok: true });
      await vi.runAllTimersAsync();
      await assertion;

      expect(tokenManager.invalidate).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(2);
      expect(get.mock.calls[1]![1].headers.Authorization).toBe('Bearer tok-2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws instead of retrying forever when a second consecutive 401 follows the retry', async () => {
    vi.useFakeTimers();
    try {
      const tokenManager = fakeTokenManager(['tok-1', 'tok-2']);
      const get = vi.fn().mockRejectedValue(axiosError(401));
      const http = { get } as unknown as AxiosInstance;

      const client = new Ft42ApiClient(config, tokenManager, silentLogger, http);
      const pending = client.get('/v2/campus');
      const assertion = expect(pending).rejects.toBeInstanceOf(Ft42ApiError);
      await vi.runAllTimersAsync();
      await assertion;

      // Exactly one retry: the original attempt plus one retry after invalidation, never more.
      expect(get).toHaveBeenCalledTimes(2);
      expect(tokenManager.invalidate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates a token acquisition failure without ever calling the 42 API', async () => {
    const tokenManager = {
      getAccessToken: vi.fn().mockRejectedValue(new Error('token acquisition failed')),
      invalidate: vi.fn(),
    } as unknown as TokenManager;
    const get = vi.fn();
    const http = { get } as unknown as AxiosInstance;

    const client = new Ft42ApiClient(config, tokenManager, silentLogger, http);
    await expect(client.get('/v2/campus')).rejects.toThrow('token acquisition failed');
    expect(get).not.toHaveBeenCalled();
  });

  it('gives up after a bounded number of retries on a sustained 429 and surfaces a rate-limit error, never retrying forever', async () => {
    vi.useFakeTimers();
    try {
      const tokenManager = fakeTokenManager(['tok-1']);
      const get = vi.fn().mockRejectedValue(axiosError(429));
      const http = { get } as unknown as AxiosInstance;

      const client = new Ft42ApiClient(config, tokenManager, silentLogger, http);
      const pending = client.get('/v2/campus');
      const assertion = expect(pending).rejects.toMatchObject({ status: 429, code: 'FT42_UPSTREAM_ERROR' });
      await vi.runAllTimersAsync();
      await assertion;

      // 1 initial attempt + MAX_RETRIES(3) retries = 4 calls total, then it stops.
      expect(get).toHaveBeenCalledTimes(4);
      // 429 is a rate-limit signal, not an auth failure - the cached token must survive it.
      expect(tokenManager.invalidate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('honors a Retry-After header when backing off from a 429', async () => {
    vi.useFakeTimers();
    try {
      const tokenManager = fakeTokenManager(['tok-1']);
      const rateLimited = axiosError(429);
      rateLimited.response!.headers = { 'retry-after': '5' };
      const get = vi
        .fn()
        .mockRejectedValueOnce(rateLimited)
        .mockResolvedValueOnce({ data: { ok: true } });
      const http = { get } as unknown as AxiosInstance;

      const client = new Ft42ApiClient(config, tokenManager, silentLogger, http);
      const pending = client.get('/v2/campus');

      // Under 5s: must not have retried yet.
      await vi.advanceTimersByTimeAsync(4_000);
      expect(get).toHaveBeenCalledTimes(1);

      // At/after 5s: the Retry-After-driven retry fires.
      await vi.advanceTimersByTimeAsync(1_500);
      await expect(pending).resolves.toEqual({ ok: true });
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
