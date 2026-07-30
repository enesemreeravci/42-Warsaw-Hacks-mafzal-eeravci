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

  app.use((req, _res, next) => {
    ctx.logger.info({ method: req.method, path: req.path }, 'incoming request');
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
