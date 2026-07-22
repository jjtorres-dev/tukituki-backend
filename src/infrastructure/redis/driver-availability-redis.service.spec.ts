import { Test, TestingModule } from '@nestjs/testing';

import { DriverAvailabilityRedisService } from './driver-availability-redis.service';
import { RedisService } from './redis.service';
import type { RedisGeoSearchResult } from './redis.service';

describe('DriverAvailabilityRedisService', () => {
  let service: DriverAvailabilityRedisService;

  let redisService: {
    geoAdd: jest.Mock<Promise<void>, [string, number, number, string]>;
    geoRemove: jest.Mock<Promise<void>, [string, ...string[]]>;
    setWithTtl: jest.Mock<Promise<void>, [string, string, number]>;
    delete: jest.Mock<Promise<void>, string[]>;
    exists: jest.Mock<Promise<boolean>, [string]>;
    expire: jest.Mock<Promise<void>, [string, number]>;
    geoSearchByRadius: jest.Mock<
      Promise<RedisGeoSearchResult[]>,
      [string, number, number, number, number]
    >;
  };

  beforeEach(async () => {
    redisService = {
      geoAdd: jest.fn<Promise<void>, [string, number, number, string]>(() =>
        Promise.resolve(),
      ),

      geoRemove: jest.fn<Promise<void>, [string, ...string[]]>(() =>
        Promise.resolve(),
      ),

      setWithTtl: jest.fn<Promise<void>, [string, string, number]>(() =>
        Promise.resolve(),
      ),

      delete: jest.fn<Promise<void>, string[]>(() => Promise.resolve()),

      exists: jest.fn<Promise<boolean>, [string]>(() => Promise.resolve(true)),

      expire: jest.fn<Promise<void>, [string, number]>(() => Promise.resolve()),

      geoSearchByRadius: jest.fn<
        Promise<RedisGeoSearchResult[]>,
        [string, number, number, number, number]
      >(() => Promise.resolve([])),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverAvailabilityRedisService,
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    service = module.get<DriverAvailabilityRedisService>(
      DriverAvailabilityRedisService,
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe publicar un conductor disponible', async () => {
    await service.publishAvailableDriver('driver-1', -76.3599, -6.4877);

    expect(redisService.geoAdd).toHaveBeenCalledWith(
      'drivers:available',
      -76.3599,
      -6.4877,
      'driver-1',
    );

    expect(redisService.setWithTtl).toHaveBeenCalledWith(
      'drivers:presence:driver-1',
      expect.any(String),
      90,
    );

    expect(redisService.setWithTtl).toHaveBeenCalledWith(
      'drivers:location-fresh:driver-1',
      expect.any(String),
      45,
    );
  });

  it('debe eliminar GEO y presencia al desconectar', async () => {
    await service.removeDriverAvailability('driver-1');

    expect(redisService.geoRemove).toHaveBeenCalledWith(
      'drivers:available',
      'driver-1',
    );

    expect(redisService.delete).toHaveBeenCalledWith(
      'drivers:presence:driver-1',
      'drivers:location-fresh:driver-1',
    );
  });

  it('debe renovar una presencia existente', async () => {
    const renewed = await service.renewPresenceIfExists('driver-1');

    expect(renewed).toBe(true);

    expect(redisService.expire).toHaveBeenCalledWith(
      'drivers:presence:driver-1',
      90,
    );
  });

  it('no debe crear presencia al renovar una clave inexistente', async () => {
    redisService.exists.mockResolvedValue(false);

    const renewed = await service.renewPresenceIfExists('driver-1');

    expect(renewed).toBe(false);

    expect(redisService.expire).not.toHaveBeenCalled();
  });

  it('debe eliminar candidatos con presencia vencida', async () => {
    redisService.geoSearchByRadius.mockResolvedValue([
      {
        member: 'driver-1',
        distanceMeters: 100,
      },
      {
        member: 'driver-2',
        distanceMeters: 250,
      },
    ]);

    redisService.exists.mockImplementation((key: string): Promise<boolean> =>
      Promise.resolve(key.endsWith('driver-1')),
    );

    const result = await service.findNearbyAvailableDrivers(
      -76.3599,
      -6.4877,
      3000,
      20,
    );

    expect(result).toEqual([
      {
        member: 'driver-1',
        distanceMeters: 100,
      },
    ]);

    expect(redisService.geoRemove).toHaveBeenCalledWith(
      'drivers:available',
      'driver-2',
    );
  });
});
