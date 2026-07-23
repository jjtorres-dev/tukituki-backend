import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  APP_NAME: Joi.string().default('TukiTuki Backend'),

  PORT: Joi.number().port().default(3001),

  API_PREFIX: Joi.string().default('api/v1'),

  ADMIN_WEB_ORIGIN: Joi.string().uri().default('http://localhost:3000'),

  DATABASE_HOST: Joi.string().required(),

  DATABASE_PORT: Joi.number().port().default(5432),

  DATABASE_NAME: Joi.string().required(),

  DATABASE_USER: Joi.string().required(),

  DATABASE_PASSWORD: Joi.string().min(8).required(),

  DATABASE_SSL: Joi.boolean().default(false),

  REDIS_HOST: Joi.string().required(),

  REDIS_PORT: Joi.number().port().default(6379),

  OTP_TTL_SECONDS: Joi.number().integer().min(60).max(600).default(300),

  OTP_RESEND_COOLDOWN_SECONDS: Joi.number()
    .integer()
    .min(30)
    .max(300)
    .default(60),

  OTP_MAX_ATTEMPTS: Joi.number().integer().min(3).max(10).default(5),

  OTP_HASH_SECRET: Joi.string().min(32).required(),

  JWT_ACCESS_SECRET: Joi.string().min(64).required(),

  JWT_ACCESS_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(3600)
    .default(900),

  REFRESH_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(86400)
    .max(7776000)
    .default(2592000),
  RIDE_START_CODE_SECRET: Joi.string().min(32).required(),
  RIDE_START_CODE_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  RIDE_START_CODE_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(5),
  RIDE_START_CODE_MAX_REGENERATIONS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(3),

  RIDE_FINAL_FARE_MAX_INCREASE_PERCENT: Joi.number()
    .integer()
    .min(0)
    .max(100)
    .default(20),

  WORKERS_ENABLED: Joi.boolean().default(true),

  RIDE_DISPATCH_POLL_INTERVAL_MS: Joi.number()
    .integer()
    .min(500)
    .max(60000)
    .default(2000),

  RIDE_DISPATCH_BATCH_SIZE: Joi.number().integer().min(1).max(100).default(25),

  OUTBOX_POLL_INTERVAL_MS: Joi.number()
    .integer()
    .min(250)
    .max(60000)
    .default(1000),

  OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(100).default(20),

  OUTBOX_MAX_ATTEMPTS: Joi.number().integer().min(1).max(50).default(8),

  OUTBOX_LOCK_TIMEOUT_SECONDS: Joi.number()
    .integer()
    .min(10)
    .max(3600)
    .default(60),

  FCM_ENABLED: Joi.boolean().default(false),

  FIREBASE_PROJECT_ID: Joi.string().max(200).optional(),

  FIREBASE_SERVICE_ACCOUNT_BASE64: Joi.when('FCM_ENABLED', {
    is: true,
    then: Joi.string().min(100).required(),
    otherwise: Joi.string().optional(),
  }),
});
