import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../config/logger.js';
import { DataService } from '../services/dataService.js';
import type { DiscoveryService } from '../services/discoveryService.js';
import type { Ft42ApiClient } from '../services/ft42ApiClient.js';
import type { RawEvent } from '../models/types.js';

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

// Offsets from the real current time (not fixed calendar dates) - loadUpcomingEventsRaw() uses
// a genuine `new Date()`, so a hardcoded past-looking date would flake depending on when the
// suite actually runs.
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function eventFixture(id: number, overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id,
    name: `Event ${id}`,
    begin_at: new Date(Date.now() + ONE_DAY_MS).toISOString(),
    end_at: new Date(Date.now() + ONE_DAY_MS + 2 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function fakeApiClient(
  calls: RecordedCall[],
  options: { paginateImpl?: (path: string, params: Record<string, unknown>) => unknown } = {},
): Ft42ApiClient {
  return {
    paginate: vi.fn().mockImplementation(async (path: string, params: Record<string, unknown>) => {
      calls.push({ path, params });
      return options.paginateImpl ? options.paginateImpl(path, params) : [];
    }),
    get: vi.fn().mockResolvedValue([]),
  } as unknown as Ft42ApiClient;
}

describe('DataService.getUpcomingEvents', () => {
  it('fetches Warsaw campus events with filter[future]=true and sort=begin_at', async () => {
    const calls: RecordedCall[] = [];
    const apiClient = fakeApiClient(calls, {
      paginateImpl: (path) => (path === '/v2/campus/67/events' ? [eventFixture(1)] : []),
    });
    const service = new DataService({ cacheTtlSeconds: 300 }, apiClient, fakeDiscovery(), silentLogger);

    const events = await service.getUpcomingEvents();

    const call = calls.find((c) => c.path === '/v2/campus/67/events');
    expect(call).toBeDefined();
    expect(call!.params['filter[future]']).toBe(true);
    expect(call!.params['sort']).toBe('begin_at');
    expect(events).toHaveLength(1);
  });

  it('deduplicates events that appear more than once', async () => {
    const calls: RecordedCall[] = [];
    const apiClient = fakeApiClient(calls, {
      paginateImpl: (path) => (path === '/v2/campus/67/events' ? [eventFixture(1), eventFixture(1)] : []),
    });
    const service = new DataService({ cacheTtlSeconds: 300 }, apiClient, fakeDiscovery(), silentLogger);

    const events = await service.getUpcomingEvents();

    expect(events).toHaveLength(1);
  });

  it('caches the result and does not re-fetch on a second call within the TTL', async () => {
    const calls: RecordedCall[] = [];
    const apiClient = fakeApiClient(calls, {
      paginateImpl: (path) => (path === '/v2/campus/67/events' ? [eventFixture(1)] : []),
    });
    const service = new DataService({ cacheTtlSeconds: 300 }, apiClient, fakeDiscovery(), silentLogger);

    await service.getUpcomingEvents();
    const callsAfterFirst = calls.length;
    await service.getUpcomingEvents();

    expect(calls.length).toBe(callsAfterFirst);
  });

  it('respects a smaller limit than the cached set without re-fetching', async () => {
    const calls: RecordedCall[] = [];
    const apiClient = fakeApiClient(calls, {
      paginateImpl: (path) =>
        path === '/v2/campus/67/events'
          ? Array.from({ length: 8 }, (_, i) =>
              eventFixture(i, {
                begin_at: new Date(Date.now() + (i + 1) * ONE_DAY_MS).toISOString(),
                end_at: new Date(Date.now() + (i + 1) * ONE_DAY_MS + 2 * 60 * 60 * 1000).toISOString(),
              }),
            )
          : [],
    });
    const service = new DataService({ cacheTtlSeconds: 300 }, apiClient, fakeDiscovery(), silentLogger);

    const events = await service.getUpcomingEvents(3);

    expect(events).toHaveLength(3);
  });
});
