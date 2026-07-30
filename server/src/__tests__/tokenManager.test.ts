import { describe, expect, it, vi } from 'vitest';
import { TokenManager, TokenAcquisitionError } from '../services/tokenManager.js';
import { createLogger } from '../config/logger.js';

const silentLogger = createLogger({ logLevel: 'silent' });
const config = { ft42ApiBaseUrl: 'https://api.intra.42.fr', ft42ClientId: 'id', ft42ClientSecret: 'secret' };

function fakeHttp(response: unknown, shouldReject = false) {
  return {
    post: vi.fn().mockImplementation(() => (shouldReject ? Promise.reject(response) : Promise.resolve({ data: response }))),
  } as unknown as import('axios').AxiosInstance;
}

describe('TokenManager', () => {
  it('requests and caches a token, reusing it on subsequent calls', async () => {
    const http = fakeHttp({ access_token: 'tok-1', expires_in: 3600 });
    const manager = new TokenManager(config, silentLogger, http);

    const first = await manager.getAccessToken();
    const second = await manager.getAccessToken();

    expect(first).toBe('tok-1');
    expect(second).toBe('tok-1');
    expect((http.post as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('reports a sanitized authenticated status without exposing the token', async () => {
    const http = fakeHttp({ access_token: 'tok-1', expires_in: 3600 });
    const manager = new TokenManager(config, silentLogger, http);
    await manager.getAccessToken();

    const status = manager.getStatus();
    expect(status.authenticated).toBe(true);
    expect(JSON.stringify(status)).not.toContain('tok-1');
  });

  it('requests a new token after invalidate() is called', async () => {
    const http = fakeHttp({ access_token: 'tok-1', expires_in: 3600 });
    const manager = new TokenManager(config, silentLogger, http);
    await manager.getAccessToken();
    manager.invalidate();
    await manager.getAccessToken();

    expect((http.post as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed token responses', async () => {
    const http = fakeHttp({ nonsense: true });
    const manager = new TokenManager(config, silentLogger, http);
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(TokenAcquisitionError);
  });

  it('shares a single in-flight refresh across concurrent callers', async () => {
    const http = fakeHttp({ access_token: 'tok-1', expires_in: 3600 });
    const manager = new TokenManager(config, silentLogger, http);

    const [a, b, c] = await Promise.all([manager.getAccessToken(), manager.getAccessToken(), manager.getAccessToken()]);

    expect(a).toBe('tok-1');
    expect(b).toBe('tok-1');
    expect(c).toBe('tok-1');
    expect((http.post as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('throws without calling the API when credentials are missing', async () => {
    const http = fakeHttp({ access_token: 'tok-1', expires_in: 3600 });
    const manager = new TokenManager({ ...config, ft42ClientId: '', ft42ClientSecret: '' }, silentLogger, http);
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(TokenAcquisitionError);
    expect((http.post as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('reuses the cached token until ~60s before expiry, then renews automatically with no explicit invalidate()', async () => {
    vi.useFakeTimers();
    try {
      const http = fakeHttp({ access_token: 'tok-1', expires_in: 3600 });
      const manager = new TokenManager(config, silentLogger, http);
      await manager.getAccessToken();

      // Still outside the 60s renewal buffer: keep serving the cached token.
      vi.setSystemTime(Date.now() + 3600_000 - 61_000);
      await expect(manager.getAccessToken()).resolves.toBe('tok-1');
      expect((http.post as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

      // Now inside the 60s renewal buffer: expect an automatic refresh.
      (http.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { access_token: 'tok-2', expires_in: 3600 } });
      vi.setSystemTime(Date.now() + 2_000);
      await expect(manager.getAccessToken()).resolves.toBe('tok-2');
      expect((http.post as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a sanitized failure when the token endpoint itself is unreachable', async () => {
    const http = fakeHttp(new Error('network down'), true);
    const manager = new TokenManager(config, silentLogger, http);

    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(TokenAcquisitionError);

    const status = manager.getStatus();
    expect(status.authenticated).toBe(false);
    expect(status.lastError).toBeTruthy();
    expect(status.lastError).not.toContain(config.ft42ClientSecret);
  });
});
