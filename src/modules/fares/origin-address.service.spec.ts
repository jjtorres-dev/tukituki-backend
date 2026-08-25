import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { RedisService } from '../../infrastructure/redis/redis.service';
import {
  FALLBACK_ORIGIN_ADDRESS,
  GoogleGeocodingService,
} from './google-geocoding.service';
import { OriginAddressService } from './origin-address.service';

const USER_ID = 'f544d52a-39e0-4da3-8861-6010355c5dba';
const OTHER_USER_ID = '9b1a2c3d-4e5f-6071-8293-a4b5c6d7e8f9';

async function expectTooManyRequests(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    throw new Error('Se esperaba HttpException 429');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    if (!(error instanceof HttpException)) throw error;
    expect(error.getStatus()).toBe(429);
  }
}

function createFakeRedis() {
  const store = new Map<string, number>();

  const redisService = {
    incrementWithTtl: jest.fn((key: string) => {
      const current = (store.get(key) ?? 0) + 1;
      store.set(key, current);
      return Promise.resolve(current);
    }),
  };

  return { redisService, store };
}

function buildConfigService(
  overrides: Record<string, unknown> = {},
): ConfigService {
  const values: Record<string, unknown> = {
    ORIGIN_ADDRESS_RATE_LIMIT_MAX: 30,
    ORIGIN_ADDRESS_RATE_LIMIT_WINDOW_SECONDS: 3600,
    ...overrides,
  };

  return {
    getOrThrow: jest.fn((key: string) => {
      if (!(key in values)) {
        throw new Error(`Missing config key: ${key}`);
      }

      return values[key];
    }),
  } as unknown as ConfigService;
}

describe('OriginAddressService', () => {
  function buildService(configOverrides: Record<string, unknown> = {}) {
    const { redisService, store } = createFakeRedis();

    const googleGeocodingService = {
      reverseGeocode: jest.fn().mockResolvedValue('Calle Rioja 495, Tarapoto'),
    };

    const configService = buildConfigService(configOverrides);

    const service = new OriginAddressService(
      redisService as unknown as RedisService,
      googleGeocodingService as unknown as GoogleGeocodingService,
      configService,
    );

    return { service, redisService, googleGeocodingService, store };
  }

  it('resuelve la dirección delegando en GoogleGeocodingService con el fallback de origen', async () => {
    const { service, googleGeocodingService } = buildService();

    const address = await service.resolve(USER_ID, -6.4877, -76.3599);

    expect(address).toBe('Calle Rioja 495, Tarapoto');
    expect(googleGeocodingService.reverseGeocode).toHaveBeenCalledWith(
      -6.4877,
      -76.3599,
      FALLBACK_ORIGIN_ADDRESS,
    );
  });

  it('incrementa el contador de Redis con la key y el TTL correctos, aislados por usuario', async () => {
    const { service, redisService } = buildService();

    await service.resolve(USER_ID, -6.4877, -76.3599);

    expect(redisService.incrementWithTtl).toHaveBeenCalledWith(
      `fares:origin-address:user:${USER_ID}`,
      3600,
    );
  });

  it('permite exactamente ORIGIN_ADDRESS_RATE_LIMIT_MAX solicitudes dentro de la ventana', async () => {
    const { service } = buildService({ ORIGIN_ADDRESS_RATE_LIMIT_MAX: 3 });

    await service.resolve(USER_ID, -6.4877, -76.3599);
    await service.resolve(USER_ID, -6.4877, -76.3599);
    await expect(service.resolve(USER_ID, -6.4877, -76.3599)).resolves.toBe(
      'Calle Rioja 495, Tarapoto',
    );
  });

  it('rechaza con 429 al superar ORIGIN_ADDRESS_RATE_LIMIT_MAX para el mismo usuario', async () => {
    const { service } = buildService({ ORIGIN_ADDRESS_RATE_LIMIT_MAX: 2 });

    await service.resolve(USER_ID, -6.4877, -76.3599);
    await service.resolve(USER_ID, -6.4877, -76.3599);

    await expectTooManyRequests(service.resolve(USER_ID, -6.4877, -76.3599));
  });

  it('el límite de un usuario no afecta el contador de otro usuario', async () => {
    const { service } = buildService({ ORIGIN_ADDRESS_RATE_LIMIT_MAX: 1 });

    await service.resolve(USER_ID, -6.4877, -76.3599);

    await expect(
      service.resolve(OTHER_USER_ID, -6.4877, -76.3599),
    ).resolves.toBe('Calle Rioja 495, Tarapoto');

    await expectTooManyRequests(service.resolve(USER_ID, -6.4877, -76.3599));
  });

  it('nunca llama a GoogleGeocodingService si el límite ya se superó', async () => {
    const { service, googleGeocodingService } = buildService({
      ORIGIN_ADDRESS_RATE_LIMIT_MAX: 1,
    });

    await service.resolve(USER_ID, -6.4877, -76.3599);

    googleGeocodingService.reverseGeocode.mockClear();

    await expectTooManyRequests(service.resolve(USER_ID, -6.4877, -76.3599));

    expect(googleGeocodingService.reverseGeocode).not.toHaveBeenCalled();
  });
});
