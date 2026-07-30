import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData, sendError } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';
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

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function dashboardRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/dashboard/summary',
    asyncHandler(async (_req, res) => {
      const { data, cacheStatus } = await ctx.dataService.getCoreDataset();
      const summary = buildDashboardSummary(data.students, data.completions, new Date(), cacheStatus);
      sendData(res, summary, { cached: cacheStatus !== 'fresh', staleData: cacheStatus === 'stale' });
    }),
  );

  router.get(
    '/dashboard/recent-completions',
    asyncHandler(async (req, res) => {
      const days = clampInt(req.query.days, 7, 1, 365);
      const limit = clampInt(req.query.limit, 20, 1, 100);
      const { data, cacheStatus } = await ctx.dataService.getCoreDataset();
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const recent = data.completions
        .filter((c) => c.validated && new Date(c.completedAt) >= since)
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
        .slice(0, limit);

      sendData(res, recent, { cached: cacheStatus !== 'fresh', staleData: cacheStatus === 'stale' });
    }),
  );

  router.get(
    '/dashboard/completion-trend',
    asyncHandler(async (req, res) => {
      const days = clampInt(req.query.days, 30, 1, 365);
      const { data, cacheStatus } = await ctx.dataService.getCoreDataset();
      const trend = buildCompletionTrend(data.completions, days, new Date());
      sendData(res, trend, { cached: cacheStatus !== 'fresh', staleData: cacheStatus === 'stale' });
    }),
  );

  router.get(
    '/dashboard/top-projects',
    asyncHandler(async (req, res) => {
      const days = clampInt(req.query.days, 30, 1, 365);
      const limit = clampInt(req.query.limit, 10, 1, 50);
      const { data, cacheStatus } = await ctx.dataService.getCoreDataset();
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const recentCompletions = data.completions.filter((c) => new Date(c.completedAt) >= since);
      const metrics = buildProjectMetrics(recentCompletions);
      const top = topProjectsByCompletions(metrics, limit);
      sendData(res, top, { cached: cacheStatus !== 'fresh', staleData: cacheStatus === 'stale' });
    }),
  );

  router.get(
    '/dashboard/top-students',
    asyncHandler(async (req, res) => {
      const metric = String(req.query.metric ?? 'level');
      const limit = clampInt(req.query.limit, 10, 1, 50);
      const days = clampInt(req.query.days, 30, 1, 365);
      const { data, cacheStatus } = await ctx.dataService.getCoreDataset();

      let result: unknown;
      if (metric === 'completedProjects') {
        result = topStudentsByCompletedProjects(data.students, limit);
      } else if (metric === 'recentCompletions') {
        result = topStudentsByRecentCompletions(data.students, data.completions, days, new Date(), limit);
      } else if (metric === 'level') {
        result = topStudentsByLevel(data.students, limit);
      } else {
        sendError(res, 'INVALID_METRIC', 'metric must be one of level, completedProjects, recentCompletions', 400);
        return;
      }

      sendData(res, result, { cached: cacheStatus !== 'fresh', staleData: cacheStatus === 'stale' });
    }),
  );

  router.get(
    '/dashboard/live-pulse',
    asyncHandler(async (_req, res) => {
      const { data, cacheStatus } = await ctx.dataService.getCoreDataset();
      const now = new Date();
      const livePulse = {
        activeNow: buildActiveNow(data.students, now, 40),
        xpLeaderboard: buildXpLeaderboard(data.completions, 7, now, 10),
        blackHoleWatch: buildBlackHoleWatch(data.students, now, 8),
        achievements: buildAchievementFeed(data.completions, 3, now, 15),
      };
      sendData(res, livePulse, { cached: cacheStatus !== 'fresh', staleData: cacheStatus === 'stale' });
    }),
  );

  router.get(
    '/dashboard/coalitions',
    asyncHandler(async (_req, res) => {
      const standings = await ctx.dataService.getCoalitions();
      sendData(res, standings);
    }),
  );

  router.get(
    '/dashboard/evaluations',
    asyncHandler(async (req, res) => {
      const limit = clampInt(req.query.limit, 15, 1, 50);
      const evaluations = await ctx.dataService.getRecentEvaluations(limit);
      sendData(res, evaluations);
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
