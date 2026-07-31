import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppContext } from './appContext.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { configRouter } from './routes/config.js';
import { dashboardRouter } from './routes/dashboard.js';
import { healthRouter } from './routes/health.js';
import { projectsRouter } from './routes/projects.js';
import { statusRouter } from './routes/status.js';
import { studentsRouter } from './routes/students.js';

export function createApp(ctx: AppContext): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: ctx.config.frontendOrigin,
      methods: ['GET', 'POST'],
    }),
  );
  app.use(compression());
  app.use(express.json());

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    // Diagnostic-only correlation ID set by the Angular app for one loadAll() batch - never
    // used for auth/routing, just so backend logs can tell "one load cycle, several routes"
    // apart from "several separate load cycles" (double init, manual reloads, retries).
    const loadId = req.header('x-dashboard-load-id') ?? null;
    let completed = false;

    ctx.logger.info({ method: req.method, path: req.path, loadId }, 'incoming request');

    res.on('finish', () => {
      completed = true;
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1_000_000);
      ctx.logger.info({ method: req.method, path: req.path, status: res.statusCode, durationMs, loadId }, 'request completed');
    });

    res.on('close', () => {
      if (completed) return;
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1_000_000);
      ctx.logger.warn(
        { method: req.method, path: req.path, durationMs, loadId },
        'request connection closed before a response was sent',
      );
    });

    next();
  });

  app.use('/api', healthRouter(ctx));
  app.use('/api', configRouter(ctx));
  app.use('/api', dashboardRouter(ctx));
  app.use('/api', studentsRouter(ctx));
  app.use('/api', projectsRouter(ctx));
  app.use('/api', statusRouter(ctx));

  app.use('/api', notFoundHandler);
  app.use(errorHandler(ctx.logger));

  return app;
}
