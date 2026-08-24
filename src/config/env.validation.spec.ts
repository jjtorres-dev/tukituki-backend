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
