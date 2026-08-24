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
    setWithTtlReturningPrevious: jest.Mock<
      Promise<string | null>,
      [string, string, number]
    >;
    addToSet: jest.Mock<Promise<void>, [string, string]>;
    popFromSet: jest.Mock<Promise<string[]>, [string, number]>;
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

      setWithTtlReturningPrevious: jest.fn<
        Promise<string | null>,
        [string, string, number]
      >(() => Promise.resolve(null)),

      addToSet: jest.fn<Promise<void>, [string, string]>(() =>
        Promise.resolve(),
      ),

      popFromSet: jest.fn<Promise<string[]>, [string, number]>(() =>
        Promise.resolve([]),
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

  it('debe limpiar la lease discoverable-armed al pasar a BUSY (G3A)', async () => {
    await service.registerBusyPresence('driver-1');

    expect(redisService.geoRemove).toHaveBeenCalledWith(
      'drivers:available',
      'driver-1',
    );

    expect(redisService.delete).toHaveBeenCalledWith(
      'drivers:discoverable-armed:driver-1',
    );
  });

  it('debe recrear solamente la presencia AVAILABLE desde heartbeat', async () => {
    await service.registerAvailablePresence('driver-1');

    expect(redisService.setWithTtl).toHaveBeenCalledWith(
      'drivers:presence:driver-1',
      expect.any(String),
      90,
    );

    expect(redisService.geoAdd).not.toHaveBeenCalled();

    expect(redisService.setWithTtl).not.toHaveBeenCalledWith(
      'drivers:location-fresh:driver-1',
      expect.any(String),
      expect.any(Number),
    );
  });

  it('debe eliminar GEO, presencia y la marca discoverable-armed al desconectar', async () => {
    await service.removeDriverAvailability('driver-1');

    expect(redisService.geoRemove).toHaveBeenCalledWith(
      'drivers:available',
      'driver-1',
    );

    expect(redisService.delete).toHaveBeenCalledWith(
      'drivers:presence:driver-1',
      'drivers:location-fresh:driver-1',
      'drivers:discoverable-armed:driver-1',
    );
  });

  it('debe encolar al conductor para late-join solo la primera vez que queda descubrible', async () => {
    redisService.setWithTtlReturningPrevious.mockResolvedValueOnce(null);

    const becameDiscoverable =
      await service.registerDiscoverableTransition('driver-1');

    expect(becameDiscoverable).toBe(true);
    expect(redisService.setWithTtlReturningPrevious).toHaveBeenCalledWith(
      'drivers:discoverable-armed:driver-1',
      '1',
      45,
    );
    expect(redisService.addToSet).toHaveBeenCalledWith(
      'drivers:late-join-pending',
      'driver-1',
    );
  });

  it('no debe re-encolar publicaciones periódicas mientras sigue descubierto, pero SÍ debe renovar el TTL de la lease', async () => {
    redisService.setWithTtlReturningPrevious.mockResolvedValueOnce('1');

    const becameDiscoverable =
      await service.registerDiscoverableTransition('driver-1');

    expect(becameDiscoverable).toBe(false);
    expect(redisService.setWithTtlReturningPrevious).toHaveBeenCalledWith(
      'drivers:discoverable-armed:driver-1',
      '1',
      45,
    );
    expect(redisService.addToSet).not.toHaveBeenCalled();
  });

  describe('lease continua (G3A - corrección TTL)', () => {
    /*
     * Emula el comportamiento real de Redis para
     * SET key value EX ttl GET: siempre escribe/renueva el TTL,
     * y devuelve atómicamente el valor anterior solo si la key
     * seguía viva en el reloj simulado. Permite probar la
     * semántica de la lease a través del tiempo sin depender de
     * un Redis real ni de temporizadores reales de Node.
     */
    function createFakeLeaseStore() {
      let nowMs = 0;
      const store = new Map<string, { value: string; expiresAtMs: number }>();

      return {
        advanceSeconds(seconds: number) {
          nowMs += seconds * 1000;
        },
        setWithTtlReturningPrevious: jest.fn(
          (
            key: string,
            value: string,
            ttlSeconds: number,
          ): Promise<string | null> => {
            const existing = store.get(key);
            const previous =
              existing && existing.expiresAtMs > nowMs ? existing.value : null;

            store.set(key, {
              value,
              expiresAtMs: nowMs + ttlSeconds * 1000,
            });

            return Promise.resolve(previous);
          },
        ),
        delete: jest.fn((...keys: string[]): Promise<void> => {
          for (const key of keys) {
            store.delete(key);
          }

          return Promise.resolve();
        }),
      };
    }

    async function buildServiceWithFakeLease() {
      const fakeLease = createFakeLeaseStore();
      const addToSet = jest.fn<Promise<void>, [string, string]>(() =>
        Promise.resolve(),
      );
      const fakeRedisService = {
        setWithTtlReturningPrevious: fakeLease.setWithTtlReturningPrevious,
        addToSet,
        delete: fakeLease.delete,
        geoRemove: jest.fn(() => Promise.resolve()),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DriverAvailabilityRedisService,
          {
            provide: RedisService,
            useValue: fakeRedisService,
          },
        ],
      }).compile();

      return {
        service: module.get<DriverAvailabilityRedisService>(
          DriverAvailabilityRedisService,
        ),
        fakeLease,
        addToSet,
      };
    }

    it('publicaciones continuas dentro del TTL renuevan la lease y NO re-disparan late-join (>45s en total)', async () => {
      const ctx = await buildServiceWithFakeLease();

      await expect(
        ctx.service.registerDiscoverableTransition('driver-1'),
      ).resolves.toBe(true); // T0: primera publicación

      ctx.fakeLease.advanceSeconds(30);
      await expect(
        ctx.service.registerDiscoverableTransition('driver-1'),
      ).resolves.toBe(false); // T+30s: lease renovada hasta T+75

      ctx.fakeLease.advanceSeconds(30);
      await expect(
        ctx.service.registerDiscoverableTransition('driver-1'),
      ).resolves.toBe(false); // T+60s: sigue viva (renovada en T+30 hasta T+75)

      ctx.fakeLease.advanceSeconds(30);
      await expect(
        ctx.service.registerDiscoverableTransition('driver-1'),
      ).resolves.toBe(false); // T+90s: sigue viva (renovada en T+60 hasta T+105)

      expect(ctx.fakeLease.setWithTtlReturningPrevious).toHaveBeenCalledTimes(
        4,
      );
      expect(ctx.addToSet).toHaveBeenCalledTimes(1);
    });

    it('deja de publicar más de DRIVER_LOCATION_TTL_SECONDS: la lease expira y la siguiente publicación es una transición nueva', async () => {
      const ctx = await buildServiceWithFakeLease();

      await expect(
        ctx.service.registerDiscoverableTransition('driver-1'),
      ).resolves.toBe(true); // T0

      ctx.fakeLease.advanceSeconds(46); // > 45s sin publicar

      await expect(
        ctx.service.registerDiscoverableTransition('driver-1'),
      ).resolves.toBe(true); // vuelve a ser "primera vez"

      expect(ctx.addToSet).toHaveBeenCalledTimes(2);
    });

    it('reconexión: goOffline/removeDriverAvailability limpia la lease y una nueva publicación AVAILABLE dispara una transición nueva', async () => {
      const ctx = await buildServiceWithFakeLease();

      await expect(
        ctx.service.registerDiscoverableTransition('driver-1'),
      ).resolves.toBe(true); // primera conexión

      ctx.fakeLease.advanceSeconds(5); // sigue dentro del TTL

      await ctx.service.removeDriverAvailability('driver-1'); // goOffline / goOnline

      await expect(
        ctx.service.registerDiscoverableTransition('driver-1'),
      ).resolves.toBe(true); // reconexión: nueva transición aunque no pasaron 45s

      expect(ctx.addToSet).toHaveBeenCalledTimes(2);
    });
  });

  it('debe drenar conductores pendientes de late-join', async () => {
    redisService.popFromSet.mockResolvedValueOnce(['driver-1', 'driver-2']);

    const drained = await service.drainLateJoinPendingDrivers(25);

    expect(drained).toEqual(['driver-1', 'driver-2']);
    expect(redisService.popFromSet).toHaveBeenCalledWith(
      'drivers:late-join-pending',
      25,
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
