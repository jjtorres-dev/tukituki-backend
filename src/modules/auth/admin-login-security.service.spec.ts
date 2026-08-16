import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../infrastructure/redis/redis.service';
import { AdminLoginSecurityService } from './admin-login-security.service';

describe('AdminLoginSecurityService', () => {
  let service: AdminLoginSecurityService;
  let redisService: {
    incrementWithTtl: jest.Mock;
    exists: jest.Mock;
    setWithTtl: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    redisService = {
      incrementWithTtl: jest.fn(() => Promise.resolve(1)),
      exists: jest.fn(() => Promise.resolve(false)),
      setWithTtl: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    };
    const values: Record<string, string | number> = {
      JWT_ACCESS_SECRET:
        'test-jwt-secret-with-at-least-sixty-four-characters-1234567890',
      ADMIN_LOGIN_WINDOW_SECONDS: 900,
      ADMIN_LOGIN_ACCOUNT_MAX_FAILURES: 5,
      ADMIN_LOGIN_IP_MAX_ATTEMPTS: 30,
      ADMIN_LOGIN_BLOCK_SECONDS: 900,
    };
    const configService = {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    service = new AdminLoginSecurityService(
      redisService as unknown as RedisService,
      configService,
    );
  });

  it('usa contadores pseudonimizados y nunca guarda teléfono o IP en la clave', async () => {
    await service.assertAllowed('+51926928920', '203.0.113.10');

    expect(redisService.incrementWithTtl).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:admin-login:ip:[a-f0-9]{24}:attempts$/),
      900,
    );
    expect(redisService.incrementWithTtl.mock.calls).not.toContainEqual([
      expect.stringContaining('+51926928920'),
      expect.any(Number),
    ]);
    expect(redisService.incrementWithTtl.mock.calls).not.toContainEqual([
      expect.stringContaining('203.0.113.10'),
      expect.any(Number),
    ]);
  });

  it('bloquea temporalmente la cuenta al alcanzar el umbral', async () => {
    redisService.incrementWithTtl.mockResolvedValue(5);

    await service.registerFailure('+51926928920', '203.0.113.10');

    expect(redisService.setWithTtl).toHaveBeenCalledWith(
      expect.stringMatching(/:blocked$/),
      '1',
      900,
    );
  });

  it('responde 429 sin revelar cuál límite fue alcanzado', async () => {
    redisService.incrementWithTtl.mockResolvedValue(31);

    try {
      await service.assertAllowed('+51926928920', '203.0.113.10');
      throw new Error('Se esperaba un bloqueo de seguridad');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      if (!(error instanceof HttpException)) throw error;
      expect(error.getStatus()).toBe(429);
      expect(error.message).not.toContain('IP');
      expect(error.message).not.toContain('cuenta');
    }
  });

  it('limpia los fallos de la cuenta después de un acceso correcto', async () => {
    await service.registerSuccess(
      '+51926928920',
      '203.0.113.10',
      'f544d52a-39e0-4da3-8861-6010355c5dba',
    );

    expect(redisService.delete).toHaveBeenCalledWith(
      expect.stringMatching(/:failures$/),
      expect.stringMatching(/:blocked$/),
    );
  });
});
