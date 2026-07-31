import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData, sendError } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { StudentSummary } from '../models/types.js';

const SORT_FIELDS = ['level', 'login', 'completedProjects', 'lastCompletion'] as const;
type SortField = (typeof SORT_FIELDS)[number];

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
