import type { ValidationError } from 'joi';

import { envValidationSchema } from './env.validation';

function validate(env: Record<string, unknown>): {
  error?: ValidationError;
  value: Record<string, unknown>;
} {
  const result = envValidationSchema.validate(env, { abortEarly: false });

  return {
    error: result.error,
    value: result.value as Record<string, unknown>,
  };
}

function baseEnv(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    DATABASE_HOST: 'localhost',
    DATABASE_NAME: 'tukituki',
    DATABASE_USER: 'tukituki',
    DATABASE_PASSWORD: 'change_me',
    REDIS_HOST: 'localhost',
    OTP_HASH_SECRET: 'test-otp-hash-secret-with-at-least-32-characters',
    JWT_ACCESS_SECRET:
      'test-jwt-access-secret-with-at-least-sixty-four-characters-1234567890',
    RIDE_START_CODE_SECRET: 'test-ride-start-code-secret-with-32-chars-min',
    ...overrides,
  };
}

describe('envValidationSchema — OTP_DEBUG_ENABLED', () => {
  it('production + OTP_DEBUG_ENABLED=true → falla la validación de config', () => {
    const { error } = validate(
      baseEnv({ NODE_ENV: 'production', OTP_DEBUG_ENABLED: 'true' }),
    );

    expect(error).toBeDefined();
    expect(error?.message).toContain('OTP_DEBUG_ENABLED');
  });

  it('production + OTP_DEBUG_ENABLED=false → pasa', () => {
    const { error } = validate(
      baseEnv({ NODE_ENV: 'production', OTP_DEBUG_ENABLED: 'false' }),
    );

    expect(error).toBeUndefined();
  });

  it('production sin OTP_DEBUG_ENABLED → pasa con default false', () => {
    const { error, value } = validate(baseEnv({ NODE_ENV: 'production' }));

    expect(error).toBeUndefined();
    expect(value.OTP_DEBUG_ENABLED).toBe(false);
  });

  it('development + OTP_DEBUG_ENABLED=true → pasa (permitido fuera de producción)', () => {
    const { error, value } = validate(
      baseEnv({ NODE_ENV: 'development', OTP_DEBUG_ENABLED: 'true' }),
    );

    expect(error).toBeUndefined();
    expect(value.OTP_DEBUG_ENABLED).toBe(true);
  });

  it('test + OTP_DEBUG_ENABLED=true → pasa (permitido fuera de producción)', () => {
    const { error, value } = validate(
      baseEnv({ NODE_ENV: 'test', OTP_DEBUG_ENABLED: 'true' }),
    );

    expect(error).toBeUndefined();
    expect(value.OTP_DEBUG_ENABLED).toBe(true);
  });

  it('sin NODE_ENV (default development) + OTP_DEBUG_ENABLED=true → pasa', () => {
    const { error } = validate(baseEnv({ OTP_DEBUG_ENABLED: 'true' }));

    expect(error).toBeUndefined();
  });
});

describe('envValidationSchema — OTP_DEMO_ENABLED (OTP-DEMO-R1)', () => {
  it('OTP_DEMO_ENABLED=false → pasa sin importar el environment de Railway', () => {
    const { error, value } = validate(baseEnv({ OTP_DEMO_ENABLED: 'false' }));

    expect(error).toBeUndefined();
    expect(value.OTP_DEMO_ENABLED).toBe(false);
  });

  it('sin OTP_DEMO_ENABLED → pasa con default false', () => {
    const { error, value } = validate(baseEnv());

    expect(error).toBeUndefined();
    expect(value.OTP_DEMO_ENABLED).toBe(false);
  });

  it('OTP_DEMO_ENABLED=true + RAILWAY_ENVIRONMENT_NAME=staging + teléfono permitido → pasa', () => {
    const { error } = validate(
      baseEnv({
        OTP_DEMO_ENABLED: 'true',
        RAILWAY_ENVIRONMENT_NAME: 'staging',
        OTP_DEMO_ALLOWED_PHONE_E164: '+51900000001',
      }),
    );

    expect(error).toBeUndefined();
  });

  it('OTP_DEMO_ENABLED=true + Railway environment production → falla', () => {
    const { error } = validate(
      baseEnv({
        OTP_DEMO_ENABLED: 'true',
        RAILWAY_ENVIRONMENT_NAME: 'production',
        OTP_DEMO_ALLOWED_PHONE_E164: '+51900000001',
      }),
    );

    expect(error).toBeDefined();
    expect(error?.message).toContain('RAILWAY_ENVIRONMENT_NAME');
  });

  it('OTP_DEMO_ENABLED=true + Railway environment vacío/no disponible → falla', () => {
    const { error } = validate(
      baseEnv({
        OTP_DEMO_ENABLED: 'true',
        OTP_DEMO_ALLOWED_PHONE_E164: '+51900000001',
      }),
    );

    expect(error).toBeDefined();
    expect(error?.message).toContain('RAILWAY_ENVIRONMENT_NAME');
  });

  it('OTP_DEMO_ENABLED=true + staging pero sin teléfono allowlisted → falla', () => {
    const { error } = validate(
      baseEnv({
        OTP_DEMO_ENABLED: 'true',
        RAILWAY_ENVIRONMENT_NAME: 'staging',
      }),
    );

    expect(error).toBeDefined();
    expect(error?.message).toContain('OTP_DEMO_ALLOWED_PHONE_E164');
  });

  it('OTP_DEBUG_ENABLED=true + NODE_ENV=production sigue fallando aunque OTP_DEMO esté involucrado', () => {
    const { error } = validate(
      baseEnv({
        NODE_ENV: 'production',
        OTP_DEBUG_ENABLED: 'true',
        OTP_DEMO_ENABLED: 'false',
      }),
    );

    expect(error).toBeDefined();
    expect(error?.message).toContain('OTP_DEBUG_ENABLED');
  });
});

describe('envValidationSchema — límites dedicados de OTP request', () => {
  it('aplica los defaults documentados cuando no se configuran', () => {
    const { error, value } = validate(baseEnv());

    expect(error).toBeUndefined();
    expect(value.OTP_REQUEST_IP_LIMIT).toBe(20);
    expect(value.OTP_REQUEST_IP_WINDOW_SECONDS).toBe(3600);
    expect(value.OTP_REQUEST_PHONE_LIMIT).toBe(5);
    expect(value.OTP_REQUEST_PHONE_WINDOW_SECONDS).toBe(3600);
  });

  it('acepta valores configurados explícitamente por env', () => {
    const { error, value } = validate(
      baseEnv({
        OTP_REQUEST_IP_LIMIT: 10,
        OTP_REQUEST_IP_WINDOW_SECONDS: 1800,
        OTP_REQUEST_PHONE_LIMIT: 3,
        OTP_REQUEST_PHONE_WINDOW_SECONDS: 1800,
      }),
    );

    expect(error).toBeUndefined();
    expect(value.OTP_REQUEST_IP_LIMIT).toBe(10);
    expect(value.OTP_REQUEST_PHONE_LIMIT).toBe(3);
  });
});
