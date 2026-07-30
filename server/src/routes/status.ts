import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export function statusRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/status/42',
    asyncHandler(async (_req, res) => {
      const status = await ctx.statusService.check();
      sendData(res, status);
    }),
  );

  return router;
}
