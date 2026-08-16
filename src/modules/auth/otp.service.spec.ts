import {
  BadRequestException,
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

import { RedisService } from '../../infrastructure/redis/redis.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { User } from '../users/entities/user.entity';
import { OtpService } from './otp.service';

const HASH_SECRET = 'test-otp-hash-secret-with-at-least-32-characters';
const PHONE = '+51987654321';
const OTHER_PHONE = '+51912345678';
const IP = '203.0.113.10';
const OTHER_IP = '203.0.113.20';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'f544d52a-39e0-4da3-8861-6010355c5dba',
    phoneE164: PHONE,
    passwordHash: 'password-hash',
    roles: [UserRole.PASSENGER],
    status: UserStatus.ACTIVE,
    isPhoneVerified: false,
    lastLoginAt: null,
    createdAt: new Date('2026-08-10T12:00:00.000Z'),
    updatedAt: new Date('2026-08-10T12:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function expectedHash(phoneE164: string, code: string): string {
  return createHmac('sha256', HASH_SECRET)
    .update(`${phoneE164}:${code}`)
    .digest('hex');
}

async function expectTooManyRequests(
  promise: Promise<unknown>,
  messageContains?: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Se esperaba HttpException 429');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    if (!(error instanceof HttpException)) throw error;
    expect(error.getStatus()).toBe(429);
    if (messageContains) {
      expect(error.message).toContain(messageContains);
    }
  }
}

function createFakeRedis() {
  const store = new Map<string, string>();
  const ttlStore = new Map<string, number>();

  const redisService = {
    get: jest.fn((key: string) =>
      Promise.resolve(store.has(key) ? (store.get(key) as string) : null),
    ),

    setWithTtl: jest.fn((key: string, value: string, ttlSeconds: number) => {
      store.set(key, value);
      ttlStore.set(key, ttlSeconds);
      return Promise.resolve();
    }),

    exists: jest.fn((key: string) => Promise.resolve(store.has(key))),

    increment: jest.fn((key: string) => {
      const current = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(current));
      return Promise.resolve(current);
    }),

    incrementWithTtl: jest.fn((key: string, ttlSeconds: number) => {
      const current = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(current));
      if (!ttlStore.has(key)) {
        ttlStore.set(key, ttlSeconds);
      }
      return Promise.resolve(current);
    }),

    ttl: jest.fn((key: string) => Promise.resolve(ttlStore.get(key) ?? -1)),

    delete: jest.fn((...keys: string[]) => {
      keys.forEach((key) => {
        store.delete(key);
        ttlStore.delete(key);
      });
      return Promise.resolve();
    }),
  };

  return { redisService, store, ttlStore };
}

function buildConfigService(
  overrides: Record<string, unknown> = {},
): ConfigService {
  const values: Record<string, unknown> = {
    OTP_TTL_SECONDS: 300,
    OTP_RESEND_COOLDOWN_SECONDS: 60,
    OTP_MAX_ATTEMPTS: 5,
    OTP_HASH_SECRET: HASH_SECRET,
    OTP_DEBUG_ENABLED: true,
    NODE_ENV: 'test',
    OTP_REQUEST_IP_LIMIT: 20,
    OTP_REQUEST_IP_WINDOW_SECONDS: 3600,
    OTP_REQUEST_PHONE_LIMIT: 5,
    OTP_REQUEST_PHONE_WINDOW_SECONDS: 3600,
    ...overrides,
  };

  return {
    get: jest.fn((key: string, defaultValue?: unknown) =>
      key in values ? values[key] : defaultValue,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in values)) {
        throw new Error(`Missing config key: ${key}`);
      }

      return values[key];
    }),
  } as unknown as ConfigService;
}

describe('OtpService', () => {
  function buildService(configOverrides: Record<string, unknown> = {}) {
    const { redisService, store, ttlStore } = createFakeRedis();
    const usersService = {
      findByPhoneE164: jest.fn(),
      activatePhone: jest.fn(),
    };
    const configService = buildConfigService(configOverrides);

    const service = new OtpService(
      redisService as unknown as RedisService,
      usersService as unknown as UsersService,
      configService,
    );

    return { service, redisService, usersService, store, ttlStore };
  }

  const otpKey = `auth:otp:phone:${PHONE}`;
  const attemptsKey = `auth:otp:phone:${PHONE}:attempts`;
  const cooldownKey = `auth:otp:phone:${PHONE}:cooldown`;

  describe('requestPhoneVerification', () => {
    it('genera un código OTP y almacena únicamente su hash, nunca en texto plano', async () => {
      const { service, usersService, store } = buildService();
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      const result = await service.requestPhoneVerification(PHONE, IP);

      expect(result.debugOtp).toMatch(/^\d{6}$/);
      const storedHash = store.get(otpKey);
      expect(storedHash).toBeDefined();
      expect(storedHash).not.toBe(result.debugOtp);
      expect(storedHash).toBe(expectedHash(PHONE, result.debugOtp as string));
    });

    it('respeta OTP_TTL_SECONDS al almacenar el código', async () => {
      const { service, usersService, redisService } = buildService({
        OTP_TTL_SECONDS: 250,
      });
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      const result = await service.requestPhoneVerification(PHONE, IP);

      expect(result.expiresIn).toBe(250);
      expect(redisService.setWithTtl).toHaveBeenCalledWith(
        otpKey,
        expect.any(String),
        250,
      );
    });

    it('inicializa el contador de intentos en 0', async () => {
      const { service, usersService, store } = buildService();
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      await service.requestPhoneVerification(PHONE, IP);

      expect(store.get(attemptsKey)).toBe('0');
    });

    it('crea el cooldown con OTP_RESEND_COOLDOWN_SECONDS', async () => {
      const { service, usersService, redisService } = buildService({
        OTP_RESEND_COOLDOWN_SECONDS: 45,
      });
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      await service.requestPhoneVerification(PHONE, IP);

      expect(redisService.setWithTtl).toHaveBeenCalledWith(
        cooldownKey,
        '1',
        45,
      );
    });

    it('teléfono sin cuenta: responde igual que un envío real, sin generar ni almacenar OTP', async () => {
      const { service, usersService, store } = buildService();
      usersService.findByPhoneE164.mockResolvedValue(null);

      const result = await service.requestPhoneVerification(PHONE, IP);

      expect(result).toEqual({ expiresIn: 300 });
      expect(store.has(otpKey)).toBe(false);
      expect(store.has(attemptsKey)).toBe(false);
      expect(store.has(cooldownKey)).toBe(true);
    });

    it('teléfono ya verificado: lanza ConflictException', async () => {
      const { service, usersService } = buildService();
      usersService.findByPhoneE164.mockResolvedValue(
        buildUser({ isPhoneVerified: true }),
      );

      await expect(
        service.requestPhoneVerification(PHONE, IP),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cooldown activo: responde 429 con el tiempo restante', async () => {
      const { service, usersService, store, ttlStore } = buildService();
      usersService.findByPhoneE164.mockResolvedValue(buildUser());
      store.set(cooldownKey, '1');
      ttlStore.set(cooldownKey, 42);

      try {
        await service.requestPhoneVerification(PHONE, IP);
        throw new Error('Se esperaba un 429 por cooldown activo');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(HttpException);
        if (!(error instanceof HttpException)) throw error;
        expect(error.getStatus()).toBe(429);
        expect(error.message).toContain('42');
      }
    });

    it('tras vencer el cooldown, un nuevo request sobrescribe el OTP anterior', async () => {
      const { service, usersService, store, redisService } = buildService();
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      const first = await service.requestPhoneVerification(PHONE, IP);
      store.delete(cooldownKey);
      const second = await service.requestPhoneVerification(PHONE, IP);

      expect(redisService.setWithTtl).toHaveBeenCalledWith(
        otpKey,
        expectedHash(PHONE, second.debugOtp as string),
        300,
      );
      expect(store.get(otpKey)).toBe(
        expectedHash(PHONE, second.debugOtp as string),
      );
      expect(first.debugOtp).not.toBe(second.debugOtp);
    });

    it('rate limit por teléfono: bloquea al superar OTP_REQUEST_PHONE_LIMIT en la ventana', async () => {
      const { service, usersService, store } = buildService({
        OTP_REQUEST_PHONE_LIMIT: 2,
      });
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      await service.requestPhoneVerification(PHONE, IP);
      store.delete(cooldownKey);
      await service.requestPhoneVerification(PHONE, IP);
      store.delete(cooldownKey);

      await expectTooManyRequests(
        service.requestPhoneVerification(PHONE, IP),
        'teléfono',
      );
    });

    it('rate limit por IP: bloquea al superar OTP_REQUEST_IP_LIMIT en la ventana, incluso con teléfonos distintos', async () => {
      const { service, usersService } = buildService({
        OTP_REQUEST_IP_LIMIT: 2,
      });
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      await service.requestPhoneVerification(PHONE, IP);
      await service.requestPhoneVerification(OTHER_PHONE, IP);

      await expect(
        service.requestPhoneVerification('+51900000000', IP),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('el límite por IP no afecta a una IP distinta', async () => {
      const { service, usersService } = buildService({
        OTP_REQUEST_IP_LIMIT: 1,
      });
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      await service.requestPhoneVerification(PHONE, IP);

      await expect(
        service.requestPhoneVerification(OTHER_PHONE, OTHER_IP),
      ).resolves.toBeDefined();
    });

    it('nunca guarda el teléfono o la IP en claro como key de Redis para los límites dedicados', async () => {
      const { service, usersService, redisService } = buildService();
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      await service.requestPhoneVerification(PHONE, IP);

      const keysUsed = redisService.incrementWithTtl.mock.calls.map(
        (call) => call[0],
      );
      keysUsed.forEach((key) => {
        expect(key).not.toContain(PHONE);
        expect(key).not.toContain(IP);
      });
    });

    it('propaga un fallo de Redis sin ocultarlo como OTP inválido', async () => {
      const { service, usersService, redisService } = buildService();
      usersService.findByPhoneE164.mockResolvedValue(buildUser());
      redisService.exists.mockRejectedValueOnce(new Error('redis down'));

      await expect(service.requestPhoneVerification(PHONE, IP)).rejects.toThrow(
        'redis down',
      );
    });
  });

  describe('verifyPhone', () => {
    async function requestValidOtp(overrides: Record<string, unknown> = {}) {
      const built = buildService(overrides);
      built.usersService.findByPhoneE164.mockResolvedValue(buildUser());
      const { debugOtp } = await built.service.requestPhoneVerification(
        PHONE,
        IP,
      );

      return { ...built, code: debugOtp as string };
    }

    it('código correcto: marca isPhoneVerified=true y limpia todas las keys', async () => {
      const { service, usersService, code, store } = await requestValidOtp();
      usersService.activatePhone.mockResolvedValue(
        buildUser({ isPhoneVerified: true }),
      );

      const result = await service.verifyPhone(PHONE, code);

      expect(usersService.activatePhone).toHaveBeenCalledWith(PHONE);
      expect(result.user.isPhoneVerified).toBe(true);
      expect(store.has(otpKey)).toBe(false);
      expect(store.has(attemptsKey)).toBe(false);
      expect(store.has(cooldownKey)).toBe(false);
    });

    it('código de un solo uso: un segundo verify con el mismo código falla', async () => {
      const { service, usersService, code } = await requestValidOtp();
      usersService.activatePhone.mockResolvedValue(
        buildUser({ isPhoneVerified: true }),
      );

      await service.verifyPhone(PHONE, code);

      await expect(service.verifyPhone(PHONE, code)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('código incorrecto: responde 401 e incrementa el contador de intentos', async () => {
      const { service, store } = await requestValidOtp();

      await expect(service.verifyPhone(PHONE, '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(store.get(attemptsKey)).toBe('1');
    });

    it('agota el máximo de intentos: responde 429 y preserva un cooldown fresco', async () => {
      const { service, store, ttlStore } = await requestValidOtp({
        OTP_MAX_ATTEMPTS: 3,
        OTP_RESEND_COOLDOWN_SECONDS: 60,
      });

      await expect(service.verifyPhone(PHONE, '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.verifyPhone(PHONE, '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      await expectTooManyRequests(service.verifyPhone(PHONE, '000000'));

      expect(store.has(otpKey)).toBe(false);
      expect(store.has(attemptsKey)).toBe(false);
      expect(store.has(cooldownKey)).toBe(true);
      expect(ttlStore.get(cooldownKey)).toBe(60);
    });

    it('tras agotar intentos, un nuevo request queda bloqueado por el cooldown preservado (sin loop instantáneo)', async () => {
      const { service, usersService, store } = await requestValidOtp({
        OTP_MAX_ATTEMPTS: 1,
      });
      usersService.findByPhoneE164.mockResolvedValue(buildUser());

      await expectTooManyRequests(service.verifyPhone(PHONE, '000000'));

      expect(store.has(cooldownKey)).toBe(true);

      await expectTooManyRequests(service.requestPhoneVerification(PHONE, IP));
    });

    it('código expirado o inexistente: responde 400', async () => {
      const { service } = buildService();

      await expect(service.verifyPhone(PHONE, '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('el hash comparado nunca es el código en texto plano', async () => {
      const { store } = await requestValidOtp();

      const storedHash = store.get(otpKey) as string;
      expect(storedHash).not.toMatch(/^\d{6}$/);
      expect(storedHash).toHaveLength(64);
    });

    it('propaga un fallo de Redis en verify sin ocultarlo como código inválido', async () => {
      const { service, redisService } = await requestValidOtp();
      redisService.get.mockRejectedValueOnce(new Error('redis down'));

      await expect(service.verifyPhone(PHONE, '123456')).rejects.toThrow(
        'redis down',
      );
    });
  });
});
