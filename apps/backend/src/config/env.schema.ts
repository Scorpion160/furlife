import { z } from 'zod';

const boolFromEnv = z.preprocess(
  (value) => value === true || value === 'true',
  z.boolean(),
);

const baseSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  PRIVACY_HASH_SECRET: z.string().min(32),
  OTP_HASH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(7_776_000).default(2_592_000),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(600).default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  OTP_PROVIDER: z.enum(['console', 'disabled']).default('disabled'),
  OTP_DEV_EXPOSE_CODE: boolFromEnv.default(false),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  SWAGGER_ENABLED: boolFromEnv.default(false),
  ADMIN_MFA_REQUIRED: boolFromEnv.default(true),
});

export type Env = z.infer<typeof baseSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const env = parsed.data;
  const origins = env.CORS_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`CORS origin must be an exact http(s) origin: ${origin}`);
    }
  }
  if (env.APP_ENV === 'staging' || env.APP_ENV === 'production') {
    if (env.CORS_ALLOWED_ORIGINS.trim().length === 0) {
      throw new Error('CORS_ALLOWED_ORIGINS must be explicit in staging/production');
    }
    if (env.S3_ENDPOINT.startsWith('http://')) {
      throw new Error('S3_ENDPOINT must use HTTPS in staging/production');
    }
    if (env.CORS_ALLOWED_ORIGINS.split(',').some((origin) => origin.trim() === '*')) {
      throw new Error('Wildcard CORS origin is forbidden in staging/production');
    }
    if (env.APP_ENV === 'production' && env.SWAGGER_ENABLED) {
      throw new Error('Swagger must be disabled in production');
    }
    if (env.OTP_PROVIDER === 'console' || env.OTP_DEV_EXPOSE_CODE) {
      throw new Error('Development OTP adapter is forbidden in staging/production');
    }
    const secrets = [env.PRIVACY_HASH_SECRET, env.OTP_HASH_SECRET, env.S3_ACCESS_KEY, env.S3_SECRET_KEY];
    if (secrets.some((value) => value.includes('CHANGE_ME'))) {
      throw new Error('Placeholder secrets are forbidden in staging/production');
    }
  }
  return env;
}
