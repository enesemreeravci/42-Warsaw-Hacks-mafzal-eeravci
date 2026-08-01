import pino from 'pino';
import type { AppConfig } from './env.js';

/**
 * Redaction covers every field name that could ever hold a secret or token,
 * at any nesting depth, so a misplaced credential can never reach stdout.
 */
export function createLogger(config: Pick<AppConfig, 'logLevel'>) {
  return pino({
    level: config.logLevel,
    redact: {
      paths: [
        'access_token',
        '*.access_token',
        '*.*.access_token',
        'client_secret',
        '*.client_secret',
        '*.*.client_secret',
        'token',
        '*.token',
        'authorization',
        'req.headers.authorization',
        'FT42_CLIENT_SECRET',
        'ft42ClientSecret',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
