import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData, sendError } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { CoreDataset } from '../services/dataService.js';
import type { DiscoveredConfig } from '../services/discoveryService.js';
import { buildBlackHoleStatus } from '../services/blackHoleStatus.js';

// Never actually read — only exists so the warming fallback has a structurally valid value.
const EMPTY_DATASET: CoreDataset = {
  students: [],
  completions: [],
  discovered: {} as DiscoveredConfig,
  currentProjectsByStudent: new Map(),
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function blackholeRouter(ctx: AppContext): Router {
  const router = Router();

  /**
   * GET /api/blackhole/status
   * Returns black hole status for all campus students with a black hole date.
   *
   * Query params:
   *   upcomingDays  - window for "Closest to Black Hole" list (default 30, max 180)
   *   recentDays    - lookback for "Recently Black Holed" list (default 30, max 90)
   *
   * Uses the existing core dataset cache — never triggers a live 42 API call.
   * Responds with a warming placeholder while the cache is still loading.
   */
  router.get(
    '/blackhole/status',
    asyncHandler(async (_req, res) => {
      const upcomingDays = clampInt(_req.query.upcomingDays, 30, 1, 180);
      const recentDays = clampInt(_req.query.recentDays, 30, 1, 90);
      const loginSearch = String(_req.query.loginSearch ?? '').trim() || null;
      const minLevelRaw = Number.parseFloat(String(_req.query.minLevel ?? ''));
      const maxLevelRaw = Number.parseFloat(String(_req.query.maxLevel ?? ''));
      const minLevel = Number.isNaN(minLevelRaw) ? null : Math.max(0, minLevelRaw);
      const maxLevel = Number.isNaN(maxLevelRaw) ? null : Math.max(0, maxLevelRaw);
      const bhFilters = { loginSearch, minLevel, maxLevel };

      const snapshot = ctx.dataService.getCoreDatasetSnapshot();
      if (snapshot) {
        const now = new Date();
        const cursusId = snapshot.data.discovered.cursusId ?? 0;
        const response = buildBlackHoleStatus(snapshot.data.students, now, cursusId, upcomingDays, recentDays, bhFilters);
        sendData(res, response, { cached: true, staleData: snapshot.cacheStatus === 'stale' });
        return;
      }

      const status = ctx.backgroundRefresh.getStatus();
      if (status.lastCoreError) {
        sendError(res, 'CACHE_UNAVAILABLE', `Black hole data is temporarily unavailable: ${status.lastCoreError}`, 502);
        return;
      }

      // Still warming — return an empty-but-valid response so the UI can show loading state.
      const now = new Date();
      const response = buildBlackHoleStatus(EMPTY_DATASET.students, now, 0, upcomingDays, recentDays, bhFilters);
      sendData(res, response, { cached: false, warming: true });
    }),
  );

  return router;
}
