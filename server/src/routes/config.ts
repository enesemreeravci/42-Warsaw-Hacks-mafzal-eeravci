import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export function configRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/config',
    asyncHandler(async (_req, res) => {
      const discovered = await ctx.dataService.getDiscoveredConfig();
      sendData(res, {
        campus: { id: discovered.campusId, name: discovered.campusName },
        cursus: { id: discovered.cursusId, name: discovered.cursusName },
        featuredLogin: ctx.config.featuredLogin,
        autoRefreshSeconds: ctx.config.autoRefreshSeconds,
        cacheTtlSeconds: ctx.config.cacheTtlSeconds,
      });
    }),
  );

  return router;
}
