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
    const tokenManager = fakeTokenManager(['tok-1', 'tok-2']);
    const get = vi.fn().mockRejectedValueOnce(axiosError(401)).mockResolvedValueOnce({ data: { ok: true } });
    const http = { get } as unknown as AxiosInstance;

    const client = new Ft42ApiClient(config, tokenManager, silentLogger, http);
    const result = await client.get('/v2/campus');

    expect(result).toEqual({ ok: true });
    expect(tokenManager.invalidate).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1]![1].headers.Authorization).toBe('Bearer tok-2');
  });

  it('throws instead of retrying forever when a second consecutive 401 follows the retry', async () => {
    const tokenManager = fakeTokenManager(['tok-1', 'tok-2']);
    const get = vi.fn().mockRejectedValue(axiosError(401));
    const http = { get } as unknown as AxiosInstance;

    const client = new Ft42ApiClient(config, tokenManager, silentLogger, http);
    await expect(client.get('/v2/campus')).rejects.toBeInstanceOf(Ft42ApiError);

    // Exactly one retry: the original attempt plus one retry after invalidation, never more.
    expect(get).toHaveBeenCalledTimes(2);
    expect(tokenManager.invalidate).toHaveBeenCalledTimes(1);
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
});
