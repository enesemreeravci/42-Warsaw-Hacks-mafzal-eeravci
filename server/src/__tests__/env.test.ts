import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from '../config/env.js';

describe('loadConfig', () => {
  it('throws a helpful error when credentials are missing and MOCK_MODE is not enabled', () => {
    expect(() => loadConfig({})).toThrow(ConfigValidationError);
    try {
      loadConfig({});
    } catch (error) {
      expect((error as Error).message).toMatch(/FT42_CLIENT_ID/);
      expect((error as Error).message).toMatch(/MOCK_MODE/);
    }
  });

  it('succeeds without credentials when MOCK_MODE=true', () => {
    const config = loadConfig({ MOCK_MODE: 'true' });
    expect(config.mockMode).toBe(true);
    expect(config.ft42CampusName).toBe('Warsaw');
  });

  it('succeeds with credentials present', () => {
    const config = loadConfig({ FT42_CLIENT_ID: 'id', FT42_CLIENT_SECRET: 'secret' });
    expect(config.mockMode).toBe(false);
    expect(config.ft42ClientId).toBe('id');
  });

  it('parses optional numeric campus/cursus ID overrides', () => {
    const config = loadConfig({ MOCK_MODE: 'true', FT42_CAMPUS_ID: '123', FT42_CURSUS_ID: '456' });
    expect(config.ft42CampusId).toBe(123);
    expect(config.ft42CursusId).toBe(456);
  });

  it('applies documented defaults', () => {
    const config = loadConfig({ MOCK_MODE: 'true' });
    expect(config.port).toBe(3000);
    expect(config.cacheTtlSeconds).toBe(300);
    expect(config.autoRefreshSeconds).toBe(300);
    expect(config.requestConcurrency).toBe(4);
  });
});
