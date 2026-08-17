import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  APP_NAME: Joi.string().default('TukiTuki Backend'),

  PORT: Joi.number().port().default(3001),

  API_PREFIX: Joi.string()
    .pattern(/^[A-Za-z0-9][A-Za-z0-9/_-]*$/)
    .default('api/v1'),

  ADMIN_WEB_ORIGIN: Joi.string().uri().default('http://localhost:3000'),

  CORS_ALLOWED_ORIGINS: Joi.string()
    .max(4096)
    .custom(validateCorsOrigins)
    .optional(),

  SWAGGER_ENABLED: Joi.boolean().default(true),

  REQUEST_BODY_LIMIT: Joi.string()
    .pattern(/^\d+(kb|mb)$/i)
    .default('1mb'),

  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(1),

  RATE_LIMIT_TTL_MS: Joi.number()
    .integer()
    .min(1000)
    .max(3600000)
    .default(60000),

  RATE_LIMIT_MAX: Joi.number().integer().min(1).max(10000).default(120),

  RATE_LIMIT_BLOCK_DURATION_MS: Joi.number()
    .integer()
    .min(0)
    .max(3600000)
    .default(60000),

  LOG_FORMAT: Joi.string().valid('pretty', 'json').default('pretty'),

  LOG_LEVEL: Joi.string()
    .pattern(
      /^(fatal|error|warn|log|debug|verbose)(,(fatal|error|warn|log|debug|verbose))*$/,
    )
    .default('fatal,error,warn,log'),

  DATABASE_HOST: Joi.string().required(),

  DATABASE_PORT: Joi.number().port().default(5432),

  DATABASE_NAME: Joi.string().required(),

  DATABASE_USER: Joi.string().required(),

  DATABASE_PASSWORD: Joi.string().min(8).required(),

  DATABASE_SSL: Joi.boolean().default(false),

  DATABASE_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(true),

  DATABASE_SSL_CA_BASE64: Joi.string().base64().allow('').optional(),

  REDIS_HOST: Joi.string().required(),

  REDIS_PORT: Joi.number().port().default(6379),

  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .allow('')
    .optional(),

  OTP_TTL_SECONDS: Joi.number().integer().min(60).max(600).default(300),

  OTP_RESEND_COOLDOWN_SECONDS: Joi.number()
    .integer()
    .min(30)
    .max(300)
    .default(60),

  OTP_MAX_ATTEMPTS: Joi.number().integer().min(3).max(10).default(5),

  OTP_HASH_SECRET: Joi.string().min(32).required(),

  /*
   * OTP-R2: en producción es estructuralmente imposible dejar
   * OTP_DEBUG_ENABLED=true (el Backend no arranca), en vez de
   * depender de que nadie olvide apagarlo manualmente en Railway.
   */
  OTP_DEBUG_ENABLED: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean()
      .truthy('true')
      .falsy('false')
      .valid(false)
      .default(false)
      .messages({
        'any.only':
          'OTP_DEBUG_ENABLED debe ser false cuando NODE_ENV=production',
      }),
    otherwise: Joi.boolean().truthy('true').falsy('false').default(false),
  }),

  /*
   * OTP-R2: protección de costo dedicada a POST /auth/otp/request,
   * independiente del throttle global (RATE_LIMIT_*). El cooldown
   * (OTP_RESEND_COOLDOWN_SECONDS) ya limita a ~1 solicitud/minuto/
   * teléfono; estos límites acotan además el total de solicitudes
   * por IP y por teléfono dentro de una ventana larga, para que un
   * teléfono no pueda recibir SMS indefinidamente solo esperando el
   * cooldown entre solicitudes.
   */
  OTP_REQUEST_IP_LIMIT: Joi.number().integer().min(1).max(1000).default(20),

  OTP_REQUEST_IP_WINDOW_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(86400)
    .default(3600),

  OTP_REQUEST_PHONE_LIMIT: Joi.number().integer().min(1).max(100).default(5),

  OTP_REQUEST_PHONE_WINDOW_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(86400)
    .default(3600),

  /*
   * OTP-DEMO-R1 (TEMPORARY): infraestructura demo para mostrar el
   * flujo real de verificación telefónica en Railway STAGING mientras
   * no exista proveedor SMS (OTP-R3). Deliberadamente separado de
   * OTP_DEBUG_ENABLED, que sigue bloqueado en producción por OTP-R2 y
   * NO se reutiliza aquí. Railway inyecta RAILWAY_ENVIRONMENT_NAME en
   * cada deployment; ese es el único environment de confianza — nunca
   * NODE_ENV (que en staging sigue siendo "production") ni nada
   * definido desde Flutter. Retirar cuando OTP-R3 esté disponible.
   */
  RAILWAY_ENVIRONMENT_NAME: Joi.when('OTP_DEMO_ENABLED', {
    is: true,
    then: Joi.string().valid('staging').required().messages({
      'any.only':
        'OTP_DEMO_ENABLED solo puede activarse cuando RAILWAY_ENVIRONMENT_NAME=staging',
      'any.required':
        'OTP_DEMO_ENABLED requiere que Railway exponga RAILWAY_ENVIRONMENT_NAME=staging',
      'string.empty':
        'OTP_DEMO_ENABLED requiere que Railway exponga RAILWAY_ENVIRONMENT_NAME=staging',
    }),
    otherwise: Joi.string().allow('').optional(),
  }),

  OTP_DEMO_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),

  OTP_DEMO_ALLOWED_PHONE_E164: Joi.when('OTP_DEMO_ENABLED', {
    is: true,
    then: Joi.string().min(8).max(20).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  JWT_ACCESS_SECRET: Joi.string().min(64).required(),

  JWT_ACCESS_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(3600)
    .default(900),

  LOGIN_SECURITY_SECRET: Joi.string().min(32).optional(),

  ADMIN_LOGIN_WINDOW_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(900),

  ADMIN_LOGIN_ACCOUNT_MAX_FAILURES: Joi.number()
    .integer()
    .min(3)
    .max(20)
    .default(5),

  ADMIN_LOGIN_IP_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(10)
    .max(500)
    .default(30),

  ADMIN_LOGIN_BLOCK_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(86400)
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

  /*
   * Durante la etapa demo las comisiones
   * quedan desactivadas de forma segura.
   *
   * ENFORCED se habilitará únicamente
   * cuando TukiTuki decida comenzar
   * a cobrar comisión a los conductores.
   */
  COMMISSION_MODE: Joi.string()
    .valid('DISABLED', 'ENFORCED')
    .default('DISABLED'),

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

  PASSENGER_CANCELLATION_GRACE_SECONDS: Joi.number()
    .integer()
    .min(0)
    .max(3600)
    .default(60),

  PASSENGER_NO_SHOW_WAIT_SECONDS: Joi.number()
    .integer()
    .min(30)
    .max(3600)
    .default(300),

  DRIVER_NO_PROGRESS_SECONDS: Joi.number()
    .integer()
    .min(30)
    .max(3600)
    .default(180),

  DRIVER_NO_PROGRESS_MIN_METERS: Joi.number()
    .integer()
    .min(0)
    .max(10000)
    .default(100),

  CANCELLATION_FEE_ASSIGNED_PEN: Joi.string()
    .pattern(/^(0|[1-9]\d*)\.\d{2}$/)
    .default('1.00'),

  CANCELLATION_FEE_ARRIVING_PEN: Joi.string()
    .pattern(/^(0|[1-9]\d*)\.\d{2}$/)
    .default('1.50'),

  CANCELLATION_FEE_ARRIVED_PEN: Joi.string()
    .pattern(/^(0|[1-9]\d*)\.\d{2}$/)
    .default('2.00'),

  PASSENGER_NO_SHOW_FEE_PEN: Joi.string()
    .pattern(/^(0|[1-9]\d*)\.\d{2}$/)
    .default('2.50'),

  DRIVER_NO_SHOW_COMPENSATION_PEN: Joi.string()
    .pattern(/^(0|[1-9]\d*)\.\d{2}$/)
    .default('1.50'),

  PUBLIC_APP_ORIGIN: Joi.string().uri().default('http://localhost:3000'),

  RIDE_SHARE_DEFAULT_TTL_MINUTES: Joi.number()
    .integer()
    .min(15)
    .max(1440)
    .default(120),

  RIDE_SHARE_MAX_TTL_MINUTES: Joi.number()
    .integer()
    .min(15)
    .max(10080)
    .default(1440),

  RIDE_SHARE_RATE_LIMIT_MAX: Joi.number()
    .integer()
    .min(5)
    .max(1000)
    .default(60),

  RIDE_SHARE_RATE_LIMIT_WINDOW_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(600),

  SAFETY_INCIDENT_RECENT_RIDE_GRACE_SECONDS: Joi.number()
    .integer()
    .min(0)
    .max(86400)
    .default(3600),

  SAFETY_LOCATION_MAX_DISTANCE_METERS: Joi.number()
    .integer()
    .min(1000)
    .max(100000)
    .default(20000),

  PUBLIC_API_ORIGIN: Joi.string().uri().default('http://localhost:3001'),

  GOOGLE_ROUTES_API_KEY: Joi.string().min(20).max(500).allow('').optional(),

  GOOGLE_PLACES_API_KEY: Joi.string().min(20).max(500).allow('').optional(),

  IZIPAY_ENABLED: Joi.boolean().default(false),

  IZIPAY_MERCHANT_CODE: Joi.when('IZIPAY_ENABLED', {
    is: true,
    then: Joi.string().min(3).max(40).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  IZIPAY_API_KEY: Joi.when('IZIPAY_ENABLED', {
    is: true,
    then: Joi.string().min(8).max(500).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  IZIPAY_KEY_HASH: Joi.when('IZIPAY_ENABLED', {
    is: true,
    then: Joi.string().min(16).max(500).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  IZIPAY_PUBLIC_KEY: Joi.when('IZIPAY_ENABLED', {
    is: true,
    then: Joi.string().min(100).max(10000).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  IZIPAY_TOKEN_SESSION_URL: Joi.string()
    .uri()
    .default('https://sandbox-api-pw.izipay.pe/security/v1/Token/Generate'),

  IZIPAY_API_KEY_HEADER: Joi.string()
    .pattern(/^[A-Za-z0-9-]{1,100}$/)
    .default('X-Api-Key'),

  IZIPAY_CHECKOUT_SCRIPT_URL: Joi.string()
    .uri()
    .default('https://sandbox-checkout.izipay.pe/payments/v1/js/index.js'),

  IZIPAY_SESSION_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(900),

  FCM_ENABLED: Joi.boolean().default(false),

  FIREBASE_PROJECT_ID: Joi.string().allow('').max(200).optional(),

  FIREBASE_SERVICE_ACCOUNT_BASE64: Joi.when('FCM_ENABLED', {
    is: true,
    then: Joi.string().min(100).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  /*
   * STORAGE-R2: Railway Storage Buckets (compatible S3).
   *
   * Deshabilitado por defecto: el Backend debe poder arrancar y
   * ejecutar tests sin credenciales reales. Cuando STORAGE_ENABLED
   * es true, el bucket/credenciales/región/endpoint pasan a ser
   * obligatorios.
   */
  STORAGE_ENABLED: Joi.boolean().default(false),

  STORAGE_BUCKET: Joi.when('STORAGE_ENABLED', {
    is: true,
    then: Joi.string().min(3).max(255).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  STORAGE_ACCESS_KEY_ID: Joi.when('STORAGE_ENABLED', {
    is: true,
    then: Joi.string().min(1).max(500).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  STORAGE_SECRET_ACCESS_KEY: Joi.when('STORAGE_ENABLED', {
    is: true,
    then: Joi.string().min(1).max(500).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  STORAGE_REGION: Joi.when('STORAGE_ENABLED', {
    is: true,
    then: Joi.string().min(1).max(100).required(),
    otherwise: Joi.string().allow('').default('auto'),
  }),

  STORAGE_ENDPOINT: Joi.when('STORAGE_ENABLED', {
    is: true,
    then: Joi.string().uri().required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  STORAGE_UPLOAD_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(300),

  STORAGE_DOWNLOAD_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(900),

  STORAGE_MAX_IMAGE_SIZE_BYTES: Joi.number()
    .integer()
    .min(1024)
    .max(52428800)
    .default(8388608),

  STORAGE_MAX_PDF_SIZE_BYTES: Joi.number()
    .integer()
    .min(1024)
    .max(52428800)
    .default(10485760),

  /*
   * STORAGE-R2.1: secreto para firmar los capability tokens de
   * avatares (ver src/modules/storage/avatar-url.util.ts). Solo
   * obligatorio cuando STORAGE_ENABLED es true, porque solo ahí puede
   * llegar a existir un photoObjectKey que necesite un token.
   */
  STORAGE_AVATAR_TOKEN_SECRET: Joi.when('STORAGE_ENABLED', {
    is: true,
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  STORAGE_AVATAR_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(900),
});

function validateCorsOrigins(
  value: string,
  helpers: Joi.CustomHelpers,
): string | Joi.ErrorReport {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0 || origins.some((origin) => origin === '*')) {
    return helpers.error('any.invalid');
  }

  try {
    origins.forEach((origin) => new URL(origin));
  } catch {
    return helpers.error('string.uri');
  }

  return value;
}
