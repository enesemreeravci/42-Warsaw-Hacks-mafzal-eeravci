import { describe, expect, it, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import type { AppContext } from '../appContext.js';
import { loadConfig } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { DataService } from '../services/dataService.js';
import { StatusService } from '../services/statusService.js';
import type { Ft42ApiClient } from '../services/ft42ApiClient.js';
import type { DiscoveryService } from '../services/discoveryService.js';
import type { TokenManager } from '../services/tokenManager.js';
import type { RawCursusUser, RawProject, RawProjectUser } from '../models/types.js';

/**
 * Fixture-backed integration tests. Rather than a separate "mock mode" branch in
 * production code, these fake only the network boundary (Ft42ApiClient/DiscoveryService)
 * so the app exercises the exact same DataService/StatusService code path a live deployment
 * uses.
 */
const cursusUsersFixture: RawCursusUser[] = [
  { id: 1, level: 5.5, end_at: null, blackholed_at: null, user: { id: 1, login: 'mafzal', displayname: 'Muhammad Afzal' } },
  { id: 2, level: 3.2, end_at: null, blackholed_at: null, user: { id: 2, login: 'astudent', displayname: 'A Student' } },
  { id: 3, level: 7.1, end_at: null, blackholed_at: null, user: { id: 3, login: 'bstudent', displayname: 'B Student' } },
  { id: 4, level: 1.0, end_at: null, blackholed_at: null, user: { id: 4, login: 'cstudent', displayname: 'C Student' } },
  { id: 5, level: 9.9, end_at: null, blackholed_at: null, user: { id: 5, login: 'dstudent', displayname: 'D Student' } },
];

const projectUsersFixture: RawProjectUser[] = [
  {
    id: 100,
    final_mark: 100,
    status: 'finished',
    'validated?': true,
    marked_at: new Date().toISOString(),
    user: { id: 1, login: 'mafzal', displayname: 'Muhammad Afzal' },
    project: { id: 1, name: 'Libft' },
  },
  {
    id: 101,
    final_mark: 80,
    status: 'finished',
    'validated?': true,
    marked_at: new Date().toISOString(),
    user: { id: 2, login: 'astudent', displayname: 'A Student' },
    project: { id: 1, name: 'Libft' },
  },
];

const projectsFixture: RawProject[] = [{ id: 1, name: 'Libft' }];

function fakePaginate(path: string): Promise<unknown[]> {
  if (path === '/v2/cursus_users') return Promise.resolve(cursusUsersFixture);
  if (path === '/v2/projects_users') return Promise.resolve(projectUsersFixture);
  if (path.includes('/locations')) return Promise.resolve([]);
  if (path.endsWith('/projects')) return Promise.resolve(projectsFixture);
  return Promise.resolve([]);
}

let app: Express;

beforeAll(() => {
  const config = loadConfig({ FT42_CLIENT_ID: 'id', FT42_CLIENT_SECRET: 'secret', FEATURED_LOGIN: 'mafzal' });
  const logger = createLogger({ logLevel: 'silent' });

  const fakeApiClient = {
    paginate: vi.fn().mockImplementation((path: string) => fakePaginate(path)),
    get: vi.fn().mockResolvedValue([{ id: 67, name: 'Warsaw' }]),
  } as unknown as Ft42ApiClient;

  const fakeDiscoveryService = {
    discoverAll: vi.fn().mockResolvedValue({ campusId: 67, campusName: 'Warsaw', cursusId: 21, cursusName: '42cursus' }),
  } as unknown as DiscoveryService;

  const fakeTokenManager = {
    getAccessToken: vi.fn().mockResolvedValue('fake-token'),
    invalidate: vi.fn(),
    getStatus: vi.fn().mockReturnValue({ authenticated: true, lastSuccessAt: new Date().toISOString(), lastError: null }),
  } as unknown as TokenManager;

  const ctx: AppContext = {
    config,
    logger,
    tokenManager: fakeTokenManager,
    apiClient: fakeApiClient,
    discoveryService: fakeDiscoveryService,
    dataService: new DataService(config, fakeApiClient, fakeDiscoveryService, logger),
    statusService: new StatusService(fakeApiClient, fakeTokenManager, logger),
    startedAt: new Date(),
    refreshInProgress: false,
  };

  app = createApp(ctx);
});

describe('GET /api/health', () => {
  it('reports ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.authReady).toBe(true);
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
