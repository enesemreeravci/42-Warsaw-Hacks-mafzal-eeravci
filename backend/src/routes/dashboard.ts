import { Router, type Response } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData, sendError } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { CoreDataset } from '../services/dataService.js';
import type { DiscoveredConfig } from '../services/discoveryService.js';
import {
  buildCompletionTrend,
  buildDashboardSummary,
  buildProjectMetrics,
  topProjectsByCompletions,
  topStudentsByCompletedProjects,
  topStudentsByLevel,
  topStudentsByRecentCompletions,
} from '../services/metrics.js';
import { buildActiveNow, buildAchievementFeed, buildBlackHoleWatch, buildXpLeaderboard } from '../services/livePulse.js';

type SnapshotCacheStatus = 'fresh' | 'cached' | 'stale';

// Never actually read (buildX() below only touch students/completions) - only exists so the
// "still warming up" fallback can hand callers a structurally valid CoreDataset.
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

/**
 * Every dashboard GET route reads through here instead of calling DataService's live loaders
 * directly - this is what guarantees a GET request never waits on a live 42 API call. When the
 * cache hasn't been populated yet (only possible in the brief window before the first
 * background refresh cycle completes, or if that cycle is failing outright) it responds
 * immediately with either a clearly-flagged empty dataset or a 502 carrying the real upstream
 * error, rather than blocking.
 */
function sendFromCoreSnapshot<T>(
  ctx: AppContext,
  res: Response,
  build: (data: CoreDataset, cacheStatus: SnapshotCacheStatus) => T,
): void {
  const snapshot = ctx.dataService.getCoreDatasetSnapshot();
  if (snapshot) {
    sendData(res, build(snapshot.data, snapshot.cacheStatus), {
      cached: true,
      staleData: snapshot.cacheStatus === 'stale',
    });
    return;
  }

  const status = ctx.backgroundRefresh.getStatus();
  if (status.lastCoreError) {
    sendError(res, 'CACHE_UNAVAILABLE', `Dashboard data is temporarily unavailable: ${status.lastCoreError}`, 502);
    return;
  }

  sendData(res, build(EMPTY_DATASET, 'stale'), { cached: false, staleData: true, warming: true });
}

export function dashboardRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/dashboard/summary',
    asyncHandler(async (_req, res) => {
      sendFromCoreSnapshot(ctx, res, (data, cacheStatus) => buildDashboardSummary(data.students, data.completions, new Date(), cacheStatus));
    }),
  );

  router.get(
    '/dashboard/recent-completions',
    asyncHandler(async (req, res) => {
      const days = clampInt(req.query.days, 7, 1, 365);
      const limit = clampInt(req.query.limit, 20, 1, 100);

      sendFromCoreSnapshot(ctx, res, (data) => {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return data.completions
          .filter((c) => c.validated && new Date(c.completedAt) >= since)
          .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
          .slice(0, limit);
      });
    }),
  );

  router.get(
    '/dashboard/completion-trend',
    asyncHandler(async (req, res) => {
      const days = clampInt(req.query.days, 30, 1, 365);
      sendFromCoreSnapshot(ctx, res, (data) => buildCompletionTrend(data.completions, days, new Date()));
    }),
  );

  router.get(
    '/dashboard/top-projects',
    asyncHandler(async (req, res) => {
      const days = clampInt(req.query.days, 30, 1, 365);
      const limit = clampInt(req.query.limit, 10, 1, 50);

      sendFromCoreSnapshot(ctx, res, (data) => {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const recentCompletions = data.completions.filter((c) => new Date(c.completedAt) >= since);
        return topProjectsByCompletions(buildProjectMetrics(recentCompletions), limit);
      });
    }),
  );

  router.get(
    '/dashboard/top-students',
    asyncHandler(async (req, res) => {
      const metric = String(req.query.metric ?? 'level');
      const limit = clampInt(req.query.limit, 10, 1, 50);
      const days = clampInt(req.query.days, 30, 1, 365);

      if (!['completedProjects', 'recentCompletions', 'level'].includes(metric)) {
        sendError(res, 'INVALID_METRIC', 'metric must be one of level, completedProjects, recentCompletions', 400);
        return;
      }

      sendFromCoreSnapshot(ctx, res, (data) => {
        if (metric === 'completedProjects') return topStudentsByCompletedProjects(data.students, limit);
        if (metric === 'recentCompletions') return topStudentsByRecentCompletions(data.students, data.completions, days, new Date(), limit);
        return topStudentsByLevel(data.students, limit);
      });
    }),
  );

  router.get(
    '/dashboard/live-pulse',
    asyncHandler(async (_req, res) => {
      sendFromCoreSnapshot(ctx, res, (data) => {
        const now = new Date();
        return {
          activeNow: buildActiveNow(data.students, now, 40),
          xpLeaderboard: buildXpLeaderboard(data.completions, 7, now, 10),
          blackHoleWatch: buildBlackHoleWatch(data.students, now, 8),
          achievements: buildAchievementFeed(data.completions, 3, now, 15),
        };
      });
    }),
  );

  router.get(
    '/dashboard/coalitions',
    asyncHandler(async (_req, res) => {
      const standings = ctx.dataService.getCoalitionsSnapshot();
      if (standings) {
        sendData(res, standings, { cached: true });
        return;
      }

      const status = ctx.backgroundRefresh.getStatus();
      if (status.lastCoreError) {
        sendError(res, 'CACHE_UNAVAILABLE', `Coalition standings are temporarily unavailable: ${status.lastCoreError}`, 502);
        return;
      }
      sendData(res, [], { cached: false, warming: true });
    }),
  );

  router.get(
    '/dashboard/evaluations',
    asyncHandler(async (req, res) => {
      // Upper bound matches loadFilledScaleTeams()'s targetFilled in dataService.ts - keep in sync.
      const limit = clampInt(req.query.limit, 15, 1, 20);
      const evaluations = ctx.dataService.getEvaluationsSnapshot(limit);
      if (evaluations) {
        sendData(res, evaluations, { cached: true });
        return;
      }

      const status = ctx.backgroundRefresh.getStatus();
      if (status.lastCoreError) {
        sendError(res, 'CACHE_UNAVAILABLE', `Evaluations are temporarily unavailable: ${status.lastCoreError}`, 502);
        return;
      }
      sendData(res, [], { cached: false, warming: true });
    }),
  );

  router.get(
    '/dashboard/weekly-campus-activity',
    asyncHandler(async (_req, res) => {
      const activity = await ctx.dataService.getWeeklyCampusActivity();
      const isStale = activity.meta.source === 'cache';
      sendData(res, activity, { cached: isStale, staleData: isStale });
    }),
  );

  router.get(
    '/dashboard/upcoming-events',
    asyncHandler(async (req, res) => {
      const limit = clampInt(req.query.limit, 5, 1, 50);
      const events = await ctx.dataService.getUpcomingEvents(limit);
      sendData(res, events);
    }),
  );

  router.post(
    '/dashboard/refresh',
    asyncHandler(async (_req, res) => {
      if (ctx.refreshInProgress) {
        sendData(res, { status: 'already-in-progress' }, {}, 202);
        return;
      }

      ctx.refreshInProgress = true;
      const startedAt = new Date().toISOString();
      try {
        ctx.dataService.invalidateAll();
        await ctx.dataService.getCoreDataset();
        sendData(res, { status: 'completed', startedAt, finishedAt: new Date().toISOString() });
      } finally {
        ctx.refreshInProgress = false;
      }
    }),
  );

  return router;
}
