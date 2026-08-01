import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../config/logger.js';
import { DataService } from '../services/dataService.js';
import type { DiscoveryService } from '../services/discoveryService.js';
import type { Ft42ApiClient } from '../services/ft42ApiClient.js';
import type { RawCursusUser, RawLocation } from '../models/types.js';

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

function cursusUserFixture(id: number): RawCursusUser {
  return { id, level: 1, end_at: null, blackholed_at: null, user: { id, login: `student${id}`, displayname: `Student ${id}` } };
}

function locationFixture(id: number, userId: number, overrides: Partial<RawLocation> = {}): RawLocation {
  return {
    id,
    begin_at: '2026-07-30T08:00:00.000Z',
    end_at: '2026-07-30T09:00:00.000Z',
    campus_id: 67,
    host: 'c1r1p1',
    user: { id: userId, login: `student${userId}`, displayname: `Student ${userId}` },
    ...overrides,
  };
}

function fakeApiClient(
  calls: RecordedCall[],
  options: {
    paginateImpl?: (path: string, params: Record<string, unknown>) => unknown;
  } = {},
): Ft42ApiClient {
  return {
    paginate: vi.fn().mockImplementation(async (path: string, params: Record<string, unknown>) => {
      calls.push({ path, params });
      return options.paginateImpl ? options.paginateImpl(path, params) : [];
    }),
    get: vi.fn().mockResolvedValue([]),
  } as unknown as Ft42ApiClient;
}

describe('DataService.getWeeklyCampusActivity', () => {
  it('fetches Warsaw locations with a dynamic range[begin_at] window and reuses the roster for validStudentIds', async () => {
    const calls: RecordedCall[] = [];
    const apiClient = fakeApiClient(calls, {
      paginateImpl: (path) => {
        if (path === '/v2/cursus_users') return [cursusUserFixture(1), cursusUserFixture(2)];
        if (path.startsWith('/v2/campus/67/locations')) return [locationFixture(1, 1)];
        return [];
      },
    });
    const service = new DataService({ cacheTtlSeconds: 300 }, apiClient, fakeDiscovery(), silentLogger);

    const result = await service.getWeeklyCampusActivity();

    // loadRosterRaw() also hits this same path (filter[active]=true, for "currently on campus")
    // as a side effect - distinguish our range-based weekly-activity fetch from that one.
    const locationsCall = calls.find((c) => c.path === '/v2/campus/67/locations' && 'range[begin_at]' in c.params);
    expect(locationsCall).toBeDefined();
    expect(String(locationsCall!.params['range[begin_at]'])).toMatch(/^\d{4}-\d{2}-\d{2}T.*,\d{4}-\d{2}-\d{2}T/);
    expect(locationsCall!.params['sort']).toBe('begin_at');

    expect(result.summary.validStudents).toBe(2);
    expect(result.mostCampusTime).toHaveLength(1);
    expect(result.meta.campusId).toBe(67);
    expect(result.meta.cursusId).toBe(21);
    expect(result.meta.source).toBe('42-api');
  });

  it('shares the roster (/v2/cursus_users) cache with getCoreDataset() instead of fetching it twice', async () => {
    const calls: RecordedCall[] = [];
    const apiClient = fakeApiClient(calls);
    const service = new DataService({ cacheTtlSeconds: 300 }, apiClient, fakeDiscovery(), silentLogger);

    await service.getCoreDataset();
    await service.getWeeklyCampusActivity();

    expect(calls.filter((c) => c.path === '/v2/cursus_users')).toHaveLength(1);
  });

  it('deduplicates location records that appear more than once (e.g. duplicate rows across pages)', async () => {
    const calls: RecordedCall[] = [];
    const apiClient = fakeApiClient(calls, {
      paginateImpl: (path) => {
        if (path === '/v2/cursus_users') return [cursusUserFixture(1)];
        if (path.startsWith('/v2/campus/67/locations')) return [locationFixture(1, 1), locationFixture(1, 1)]; // same id twice
        return [];
      },
    });
    const service = new DataService({ cacheTtlSeconds: 300 }, apiClient, fakeDiscovery(), silentLogger);

    const result = await service.getWeeklyCampusActivity();

    expect(result.summary.locationRecordsProcessed).toBe(1);
    expect(result.mostSessionsStarted[0]?.sessionCount).toBe(1);
  });

  it('caches the result and does not re-fetch on a second call within the TTL', async () => {
    const calls: RecordedCall[] = [];
    const apiClient = fakeApiClient(calls, {
      paginateImpl: (path) => {
        if (path === '/v2/cursus_users') return [cursusUserFixture(1)];
        if (path.startsWith('/v2/campus/67/locations')) return [locationFixture(1, 1)];
        return [];
      },
    });
    const service = new DataService({ cacheTtlSeconds: 300 }, apiClient, fakeDiscovery(), silentLogger);

    await service.getWeeklyCampusActivity();
    const callsAfterFirst = calls.length;
    await service.getWeeklyCampusActivity();

    expect(calls.length).toBe(callsAfterFirst);
  });

  it('falls back to stale cached data with meta.source "cache" and a warning when the upstream call fails', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));

      const calls: RecordedCall[] = [];
      let shouldFail = false;
      const apiClient = fakeApiClient(calls, {
        paginateImpl: (path) => {
          if (path === '/v2/cursus_users') return [cursusUserFixture(1)];
          if (path.startsWith('/v2/campus/67/locations')) {
            if (shouldFail) throw new Error('upstream unreachable');
            return [locationFixture(1, 1)];
          }
          return [];
        },
      });
      const service = new DataService({ cacheTtlSeconds: 300 }, apiClient, fakeDiscovery(), silentLogger);

      const first = await service.getWeeklyCampusActivity();
      expect(first.meta.source).toBe('42-api');

      // Past the 45-minute weekly-activity TTL, so the cache entry is stale (not cleared -
      // still present, just expired) and the next load attempt hits the upstream again.
      vi.setSystemTime(new Date('2026-07-31T12:46:00.000Z'));
      shouldFail = true;

      const second = await service.getWeeklyCampusActivity();
      expect(second.meta.source).toBe('cache');
      expect(second.meta.warning).toBe('Showing cached data because live data is unavailable');
      expect(second.mostCampusTime).toEqual(first.mostCampusTime);
    } finally {
      vi.useRealTimers();
    }
  });
});
