import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../config/logger.js';
import { BackgroundRefreshService } from '../services/backgroundRefresh.js';
import type { DataService } from '../services/dataService.js';

const silentLogger = createLogger({ logLevel: 'silent' });

function fakeDataService(overrides: Partial<Record<'getCoreDataset' | 'getCoalitions' | 'getRecentEvaluations' | 'getHistoricalCoreDataset', unknown>> = {}) {
  return {
    getCoreDataset: vi.fn().mockResolvedValue({ data: {}, cacheStatus: 'fresh' }),
    getCoalitions: vi.fn().mockResolvedValue([]),
    getRecentEvaluations: vi.fn().mockResolvedValue([]),
    getHistoricalCoreDataset: vi.fn().mockResolvedValue({ data: {}, cacheStatus: 'fresh' }),
    ...overrides,
  } as unknown as DataService;
}

describe('BackgroundRefreshService', () => {
  it('warmup() runs one core cycle and one historical cycle and records success', async () => {
    const dataService = fakeDataService();
    const service = new BackgroundRefreshService(dataService, silentLogger);

    await service.warmup();

    expect(dataService.getCoreDataset).toHaveBeenCalledTimes(1);
    expect(dataService.getCoalitions).toHaveBeenCalledTimes(1);
    expect(dataService.getRecentEvaluations).toHaveBeenCalledTimes(1);
    expect(dataService.getHistoricalCoreDataset).toHaveBeenCalledTimes(1);

    const status = service.getStatus();
    expect(status.lastCoreSuccessAt).not.toBeNull();
    expect(status.lastCoreError).toBeNull();
    expect(status.lastHistoricalSuccessAt).not.toBeNull();
    expect(status.lastHistoricalError).toBeNull();
  });

  it('a failing core cycle records the error without throwing and without affecting the historical cycle', async () => {
    const dataService = fakeDataService({
      getCoreDataset: vi.fn().mockRejectedValue(new Error('42 API unreachable')),
    });
    const service = new BackgroundRefreshService(dataService, silentLogger);

    await expect(service.warmup()).resolves.toBeUndefined();

    const status = service.getStatus();
    expect(status.lastCoreError).toBe('42 API unreachable');
    expect(status.lastHistoricalSuccessAt).not.toBeNull();
    expect(status.lastHistoricalError).toBeNull();
  });

  it('a failing historical cycle does not prevent the core cycle from succeeding', async () => {
    const dataService = fakeDataService({
      getHistoricalCoreDataset: vi.fn().mockRejectedValue(new Error('too many pages')),
    });
    const service = new BackgroundRefreshService(dataService, silentLogger);

    await service.warmup();

    const status = service.getStatus();
    expect(status.lastCoreSuccessAt).not.toBeNull();
    expect(status.lastCoreError).toBeNull();
    expect(status.lastHistoricalError).toBe('too many pages');
  });

  it('start() schedules recurring core refreshes, and stop() ends them', async () => {
    vi.useFakeTimers();
    try {
      const dataService = fakeDataService();
      const service = new BackgroundRefreshService(dataService, silentLogger);

      await service.warmup();
      service.start();

      await vi.advanceTimersByTimeAsync(45_000);
      expect(dataService.getCoreDataset).toHaveBeenCalledTimes(2); // 1 from warmup() + 1 interval tick

      service.stop();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(dataService.getCoreDataset).toHaveBeenCalledTimes(2); // no further ticks once stopped
    } finally {
      vi.useRealTimers();
    }
  });
});
