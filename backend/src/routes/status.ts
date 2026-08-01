import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export function statusRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/status/42',
    asyncHandler(async (_req, res) => {
      // Cache-only read - the live probe runs on BackgroundRefreshService's own timer instead
      // (see StatusService.getSnapshot()), so this route never blocks a request on a live call.
      const status = ctx.statusService.getSnapshot();
      sendData(res, status);
    }),
  );

  return router;
}
