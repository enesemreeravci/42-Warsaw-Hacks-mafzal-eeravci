import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData, sendError } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { buildProjectMetrics } from '../services/metrics.js';

export function projectsRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/projects',
    asyncHandler(async (_req, res) => {
      const projects = await ctx.dataService.getProjects();
      sendData(res, projects);
    }),
  );

  router.get(
    '/projects/:projectId/metrics',
    asyncHandler(async (req, res) => {
      const projectId = Number.parseInt(String(req.params.projectId), 10);
      if (Number.isNaN(projectId)) {
        sendError(res, 'INVALID_PROJECT_ID', 'projectId must be numeric.', 400);
        return;
      }

      const { data, cacheStatus } = await ctx.dataService.getCoreDataset();
      const metrics = buildProjectMetrics(data.completions.filter((c) => c.projectId === projectId));
      const metric = metrics[0];

      if (!metric) {
        sendError(res, 'PROJECT_NOT_FOUND', `No completion data found for project ${projectId}.`, 404);
        return;
      }

      sendData(res, metric, { cached: cacheStatus !== 'fresh', staleData: cacheStatus === 'stale' });
    }),
  );

  return router;
}
