import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { createAppContext } from './appContext.js';
import { createApp } from './app.js';
import { ConfigValidationError, loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';

// Load the monorepo-root .env regardless of the process's working directory -
// `npm run dev --workspace backend` runs with cwd=backend/, not the repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(`\n[CONFIG ERROR] ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger(config);
  const ctx = createAppContext(config, logger);
  const app = createApp(ctx);

  // Kick off cache warming, but never let it gate the HTTP listener: DataService's retry logic
  // honors the 42 API's own Retry-After header (seen live: 129s after a 429), so "warmup" can
  // legitimately take minutes even though it never throws. Blocking listen() on that would make
  // the *entire* server - health checks, static assets, everything - unreachable for that whole
  // window, which is worse than the slow-dashboard-request problem this was meant to fix.
  // Routes already degrade to a fast "warming" response via DataService's cache-only snapshots
  // (see routes/dashboard.ts, routes/students.ts) until the first cycle actually completes.
  void ctx.backgroundRefresh.warmup();
  ctx.backgroundRefresh.start();

  // Non-blocking, same reasoning as backgroundRefresh above - never gates the HTTP listener.
  ctx.coalitionSnapshotScheduler.warmup();
  ctx.coalitionSnapshotScheduler.start();

  app.listen(config.port, () => {
    logger.info(
      { port: config.port, frontendOrigin: config.frontendOrigin },
      `42 Warsaw Progress Insight server listening on port ${config.port}`,
    );
  });
}

main().catch((error) => {
  console.error('Fatal startup error', error);
  process.exit(1);
});
