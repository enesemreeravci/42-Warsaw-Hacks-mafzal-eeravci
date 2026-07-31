import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../config/logger.js';
import { DataService } from '../services/dataService.js';
import type { DiscoveryService } from '../services/discoveryService.js';
import type { Ft42ApiClient } from '../services/ft42ApiClient.js';

const silentLogger = createLogger({ logLevel: 'silent' });

function fakeDiscovery(): DiscoveryService {
  return {
    discoverAll: vi.fn().mockResolvedValue({ campusId: 67, campusName: 'Warsaw', cursusId: 21, cursusName: '42cursus' }),
  } as unknown as DiscoveryService;
}

interface RecordedCall {
  path: string;
  params: Record<string, unknown>;
}

function fakeApiClient(calls: RecordedCall[]): Ft42ApiClient {
  return {
    paginate: vi.fn().mockImplementation(async (path: string, params: Record<string, unknown>) => {
      calls.push({ path, params });
      return [];
    }),
    get: vi.fn().mockResolvedValue([]),
  } as unknown as Ft42ApiClient;
}

describe('DataService fast/historical dataset split', () => {
  it('getCoreDataset() bounds /v2/projects_users to a recent range[updated_at] window instead of full history', async () => {
    const calls: RecordedCall[] = [];
    const service = new DataService({ cacheTtlSeconds: 300 }, fakeApiClient(calls), fakeDiscovery(), silentLogger);

    await service.getCoreDataset();

    const projectsUsersCall = calls.find((c) => c.path === '/v2/projects_users');
    expect(projectsUsersCall).toBeDefined();
    expect(projectsUsersCall!.params['range[updated_at]']).toBeDefined();
    expect(String(projectsUsersCall!.params['range[updated_at]'])).toMatch(/^\d{4}-\d{2}-\d{2}T.*,\d{4}-\d{2}-\d{2}T/);
  });

  it('getHistoricalCoreDataset() fetches unbounded full history, with no date range filter', async () => {
    const calls: RecordedCall[] = [];
    const service = new DataService({ cacheTtlSeconds: 300 }, fakeApiClient(calls), fakeDiscovery(), silentLogger);

    await service.getHistoricalCoreDataset();

    const projectsUsersCall = calls.find((c) => c.path === '/v2/projects_users');
    expect(projectsUsersCall).toBeDefined();
    expect(projectsUsersCall!.params['range[updated_at]']).toBeUndefined();
  });

  it('shares one roster (/v2/cursus_users) fetch between the fast and historical paths instead of loading it twice', async () => {
    const calls: RecordedCall[] = [];
    const service = new DataService({ cacheTtlSeconds: 300 }, fakeApiClient(calls), fakeDiscovery(), silentLogger);

    await service.getCoreDataset();
    await service.getHistoricalCoreDataset();

    expect(calls.filter((c) => c.path === '/v2/cursus_users')).toHaveLength(1);
  });

  it('getStudentDetail() reads through the historical (accurate, unbounded) dataset', async () => {
    const calls: RecordedCall[] = [];
    const service = new DataService({ cacheTtlSeconds: 300 }, fakeApiClient(calls), fakeDiscovery(), silentLogger);

    await service.getStudentDetail('nobody');

    const projectsUsersCall = calls.find((c) => c.path === '/v2/projects_users');
    expect(projectsUsersCall!.params['range[updated_at]']).toBeUndefined();
  });
});

describe('DataService cache-only snapshots (never trigger a live 42 API call)', () => {
  it('getCoreDatasetSnapshot() is null until getCoreDataset() has loaded at least once, then reads from cache only', async () => {
    const calls: RecordedCall[] = [];
    const service = new DataService({ cacheTtlSeconds: 300 }, fakeApiClient(calls), fakeDiscovery(), silentLogger);

    expect(service.getCoreDatasetSnapshot()).toBeNull();

    await service.getCoreDataset();
    const callsAfterLoad = calls.length;

    const snapshot = service.getCoreDatasetSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.data.students).toEqual([]);
    expect(calls.length).toBe(callsAfterLoad); // no additional 42 API calls from the snapshot read
  });

  it('getCoalitionsSnapshot() and getEvaluationsSnapshot() are null until their loaders have populated the cache', async () => {
    const service = new DataService({ cacheTtlSeconds: 300 }, fakeApiClient([]), fakeDiscovery(), silentLogger);

    expect(service.getCoalitionsSnapshot()).toBeNull();
    expect(service.getEvaluationsSnapshot(10)).toBeNull();

    await service.getCoreDataset();
    await service.getCoalitions();
    await service.getRecentEvaluations(10);

    expect(service.getCoalitionsSnapshot()).toEqual([]);
    expect(service.getEvaluationsSnapshot(10)).toEqual([]);
  });

  it('getStudentDetailSnapshot() reports "warming" until something is cached, then a partial result off the fast dataset before falling back to the full historical one', async () => {
    const service = new DataService({ cacheTtlSeconds: 300 }, fakeApiClient([]), fakeDiscovery(), silentLogger);

    expect(service.getStudentDetailSnapshot('nobody')).toEqual({ status: 'warming' });

    await service.getCoreDataset();
    expect(service.getStudentDetailSnapshot('nobody')).toMatchObject({ status: 'ready', partialHistory: true, detail: null });

    await service.getHistoricalCoreDataset();
    expect(service.getStudentDetailSnapshot('nobody')).toMatchObject({ status: 'ready', partialHistory: false, detail: null });
  });
});
