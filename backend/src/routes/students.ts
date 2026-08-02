import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData, sendError } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { StudentSummary } from '../models/types.js';
import type { ReturningSortOption } from '../services/returningStudents.js';

const SORT_FIELDS = ['level', 'login', 'completedProjects', 'lastCompletion'] as const;
type SortField = (typeof SORT_FIELDS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
type ReturningPeriodOption = 'today' | 'last7Days' | 'thisWeek' | 'thisMonth' | 'custom';
const RETURNING_SORT_OPTIONS = ['recent', 'longestAbsence', 'level', 'login'] as const;
const RETURNING_THRESHOLD_OPTIONS = [7, 14, 30, 60] as const;

/**
 * Duration-based (not Warsaw-calendar-exact) period parsing - "thisWeek" is a 7-day rolling
 * window rather than a strict Monday-start week, and "thisMonth" is a 30-day rolling window.
 * That precision doesn't matter here the way it does for the evaluation heatmap's day/hour
 * bucketing; an approximate reporting window is fine for "which students came back recently".
 */
function parseReturningPeriod(option: string, fromParam: string, toParam: string, now: Date): { start: Date; end: Date } {
  switch (option as ReturningPeriodOption) {
    case 'today':
      return { start: new Date(now.getTime() - DAY_MS), end: now };
    case 'thisMonth':
      return { start: new Date(now.getTime() - 30 * DAY_MS), end: now };
    case 'custom': {
      const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 7 * DAY_MS);
      const to = toParam ? new Date(toParam) : now;
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        return { start: new Date(now.getTime() - 7 * DAY_MS), end: now };
      }
      return { start: from, end: to };
    }
    case 'thisWeek':
    case 'last7Days':
    default:
      return { start: new Date(now.getTime() - 7 * DAY_MS), end: now };
  }
}

function sortStudents(students: StudentSummary[], sort: SortField, direction: 'asc' | 'desc'): StudentSummary[] {
  const factor = direction === 'asc' ? 1 : -1;
  const sorted = [...students].sort((a, b) => {
    switch (sort) {
      case 'login':
        return a.login.localeCompare(b.login) * factor;
      case 'completedProjects':
        return (a.completedProjectCount - b.completedProjectCount) * factor;
      case 'lastCompletion': {
        const aTime = a.lastCompletionDate ? new Date(a.lastCompletionDate).getTime() : 0;
        const bTime = b.lastCompletionDate ? new Date(b.lastCompletionDate).getTime() : 0;
        return (aTime - bTime) * factor;
      }
      case 'level':
      default:
        return (a.level - b.level) * factor;
    }
  });
  return sorted;
}

export function studentsRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/students',
    asyncHandler(async (req, res) => {
      const page = Math.max(Number.parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
      const pageSize = Math.min(Math.max(Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20, 1), 100);
      const search = String(req.query.search ?? '').trim().toLowerCase();
      const sort = SORT_FIELDS.includes(req.query.sort as SortField) ? (req.query.sort as SortField) : 'level';
      const direction = req.query.direction === 'asc' ? 'asc' : 'desc';
      const activeOnly = req.query.activeOnly === 'true';

      // Cache-only read - never awaits a live 42 API call. Previously this awaited
      // getHistoricalCoreDataset() directly, which on a cache miss pages through the full,
      // unbounded history (100+ pages at the 42 API's 2 req/s limit) inline in the request,
      // long enough to look like a hung connection to the client. Background prewarming (see
      // BackgroundRefreshService) is what now keeps this cache-only read populated; it prefers
      // the full historical dataset but falls back to the fast/recent-window one (flagged via
      // `partialHistory`) rather than ever blocking on the slow load itself.
      const snapshot = ctx.dataService.getStudentsListSnapshot();
      if (snapshot.status === 'warming') {
        sendError(res, 'CACHE_WARMING', 'Student data is still warming up. Please try again shortly.', 503);
        return;
      }

      let filtered = snapshot.data.students;
      if (search) {
        filtered = filtered.filter(
          (s) => s.login.toLowerCase().includes(search) || s.displayName.toLowerCase().includes(search),
        );
      }
      if (activeOnly) {
        filtered = filtered.filter((s) => s.active);
      }

      const sorted = sortStudents(filtered, sort, direction);
      const totalItems = sorted.length;
      const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
      const start = (page - 1) * pageSize;
      const items = sorted.slice(start, start + pageSize);

      sendData(
        res,
        { items, page, pageSize, totalItems, totalPages },
        { cached: true, staleData: snapshot.cacheStatus === 'stale', partialHistory: snapshot.partialHistory },
      );
    }),
  );

  // Registered before '/students/:login' - Express matches route paths in order, and ':login'
  // would otherwise greedily swallow the literal path segment "returning".
  router.get(
    '/students/returning',
    asyncHandler(async (req, res) => {
      const now = new Date();
      const period = parseReturningPeriod(
        String(req.query.period ?? 'last7Days'),
        String(req.query.from ?? ''),
        String(req.query.to ?? ''),
        now,
      );
      const threshold = RETURNING_THRESHOLD_OPTIONS.includes(Number(req.query.threshold) as (typeof RETURNING_THRESHOLD_OPTIONS)[number])
        ? Number(req.query.threshold)
        : 14;
      const sort: ReturningSortOption = RETURNING_SORT_OPTIONS.includes(req.query.sort as ReturningSortOption)
        ? (req.query.sort as ReturningSortOption)
        : 'recent';

      const result = await ctx.dataService.getReturningStudents(period, threshold, sort);
      const isStale = result.meta.source === 'cache';
      sendData(res, result, { cached: isStale, staleData: isStale });
    }),
  );

  router.get(
    '/students/:login',
    asyncHandler(async (req, res) => {
      const login = String(req.params.login);

      // Cache-only read - never awaits a live 42 API call. Previously this awaited
      // getStudentDetail(), which reads through the unbounded historical dataset (100+ paginated
      // requests at the 42 API's 2 req/s limit); on a cache miss that could take a minute or
      // more, long enough to look like a hung connection to the client. Background prewarming
      // (see BackgroundRefreshService) is what now keeps this cache-only read populated.
      const snapshot = ctx.dataService.getStudentDetailSnapshot(login);

      if (snapshot.status === 'warming') {
        sendError(res, 'CACHE_WARMING', 'Student data is still warming up. Please try again shortly.', 503);
        return;
      }
      if (!snapshot.detail) {
        sendError(res, 'STUDENT_NOT_FOUND', `No student found with login "${login}".`, 404);
        return;
      }

      sendData(res, snapshot.detail, {
        cached: true,
        staleData: snapshot.cacheStatus === 'stale',
        // Full completed-project history isn't cached yet - the recent-window dataset was used
        // instead, so completedProjects only reflects the last ~45 days until the next
        // historical background cycle completes.
        partialHistory: snapshot.partialHistory,
      });
    }),
  );

  return router;
}
