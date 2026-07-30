import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData } from '../middleware/envelope.js';

export function healthRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    sendData(res, {
      status: 'ok',
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      cacheAvailable: true,
      authReady: Boolean(ctx.config.ft42ClientId && ctx.config.ft42ClientSecret),
    });
  });

  return router;
}
