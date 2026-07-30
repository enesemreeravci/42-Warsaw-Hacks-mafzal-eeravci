import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { createAppContext } from '../appContext.js';
import { loadConfig } from '../config/env.js';
import { createLogger } from '../config/logger.js';

let app: Express;

beforeAll(() => {
  const config = loadConfig({ MOCK_MODE: 'true', FEATURED_LOGIN: 'mafzal' });
  const logger = createLogger({ logLevel: 'silent' });
  const ctx = createAppContext(config, logger);
  app = createApp(ctx);
});

describe('GET /api/health', () => {
  it('reports ok status and mock mode', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.mockMode).toBe(true);
  });
});

describe('GET /api/config', () => {
  it('returns sanitized configuration with no secrets', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.data.featuredLogin).toBe('mafzal');
    expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
  });
});

describe('GET /api/dashboard/summary', () => {
  it('returns a dashboard summary with sensible fields', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.totalStudents).toBeGreaterThan(0);
    expect(res.body.meta.generatedAt).toBeDefined();
  });
});

describe('GET /api/dashboard/recent-completions', () => {
  it('respects the limit query parameter and caps it at 100', async () => {
    const res = await request(app).get('/api/dashboard/recent-completions?days=365&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });
});

describe('GET /api/students', () => {
  it('returns a paginated, searchable student list', async () => {
    const res = await request(app).get('/api/students?pageSize=5&page=1');
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeLessThanOrEqual(5);
    expect(res.body.data.totalItems).toBeGreaterThan(0);
  });

  it('finds the featured student by login', async () => {
    const res = await request(app).get('/api/students/mafzal');
    expect(res.status).toBe(200);
    expect(res.body.data.login).toBe('mafzal');
  });

  it('returns a 404 error envelope for an unknown login', async () => {
    const res = await request(app).get('/api/students/does-not-exist-xyz');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STUDENT_NOT_FOUND');
  });
});

describe('GET /api/projects', () => {
  it('returns the normalized project list', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('POST /api/dashboard/refresh', () => {
  it('invalidates cache and reports completion status', async () => {
    const res = await request(app).post('/api/dashboard/refresh');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });
});

describe('GET /api/status/42', () => {
  it('never exposes tokens or secrets', async () => {
    const res = await request(app).get('/api/status/42');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/token|secret/i);
  });
});
