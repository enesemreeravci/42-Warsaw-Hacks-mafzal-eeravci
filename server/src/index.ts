import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { createAppContext } from './appContext.js';
import { createApp } from './app.js';
import { ConfigValidationError, loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';

// Load the monorepo-root .env regardless of the process's working directory -
// `npm run dev --workspace server` runs with cwd=server/, not the repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function main(): void {
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

  app.listen(config.port, () => {
    logger.info(
      { port: config.port, frontendOrigin: config.frontendOrigin },
      `42 Warsaw Progress Insight server listening on port ${config.port}`,
    );
  });
}

main();
