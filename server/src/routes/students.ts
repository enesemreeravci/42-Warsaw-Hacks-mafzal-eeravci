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

      const { data, cacheStatus } = await ctx.dataService.getCoreDataset();

      let filtered = data.students;
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
        { cached: cacheStatus !== 'fresh', staleData: cacheStatus === 'stale' },
      );
    }),
  );

  router.get(
    '/students/:login',
    asyncHandler(async (req, res) => {
      const login = String(req.params.login);
      const detail = await ctx.dataService.getStudentDetail(login);
      if (!detail) {
        sendError(res, 'STUDENT_NOT_FOUND', `No student found with login "${login}".`, 404);
        return;
      }
      sendData(res, detail);
    }),
  );

  return router;
}
