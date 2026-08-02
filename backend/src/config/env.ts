import { z } from 'zod';

const intFromString = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : Number.parseInt(v, 10)))
    .pipe(z.number().int().positive());

const envSchema = z
  .object({
    FT42_CLIENT_ID: z.string().optional().default(''),
    FT42_CLIENT_SECRET: z.string().optional().default(''),
    FT42_API_BASE_URL: z.string().url().default('https://api.intra.42.fr'),
    FT42_CAMPUS_NAME: z.string().default('Warsaw'),
    FT42_CAMPUS_ID: z.string().optional(),
    FT42_CURSUS_NAME: z.string().default('42cursus'),
    FT42_CURSUS_ID: z.string().optional(),
    FEATURED_LOGIN: z.string().default('mafzal'),
    PORT: intFromString(3000),
    FRONTEND_ORIGIN: z.string().default('http://localhost:4200'),
    CACHE_TTL_SECONDS: intFromString(420),
    AUTO_REFRESH_SECONDS: intFromString(300),
    REQUEST_CONCURRENCY: intFromString(4),
    LOG_LEVEL: z.string().default('info'),
  })
  .transform((env) => ({
    ft42ClientId: env.FT42_CLIENT_ID,
    ft42ClientSecret: env.FT42_CLIENT_SECRET,
    ft42ApiBaseUrl: env.FT42_API_BASE_URL,
    ft42CampusName: env.FT42_CAMPUS_NAME,
    ft42CampusId: env.FT42_CAMPUS_ID ? Number.parseInt(env.FT42_CAMPUS_ID, 10) : undefined,
    ft42CursusName: env.FT42_CURSUS_NAME,
    ft42CursusId: env.FT42_CURSUS_ID ? Number.parseInt(env.FT42_CURSUS_ID, 10) : undefined,
    featuredLogin: env.FEATURED_LOGIN,
    port: env.PORT,
    frontendOrigin: env.FRONTEND_ORIGIN,
    cacheTtlSeconds: env.CACHE_TTL_SECONDS,
    autoRefreshSeconds: env.AUTO_REFRESH_SECONDS,
    requestConcurrency: env.REQUEST_CONCURRENCY,
    logLevel: env.LOG_LEVEL,
  }));

export type AppConfig = z.infer<typeof envSchema>;

export class ConfigValidationError extends Error {}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigValidationError(`Invalid environment configuration: ${issues}`);
  }

  const config = parsed.data;

  if (!config.ft42ClientId || !config.ft42ClientSecret) {
    throw new ConfigValidationError(
      'FT42_CLIENT_ID and FT42_CLIENT_SECRET are required. ' +
        'Copy .env.example to .env and fill in your 42 API application credentials.',
    );
  }

  return config;
}
