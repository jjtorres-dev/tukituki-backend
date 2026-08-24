import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverLocationsService } from '../driver-operations/driver-locations.service';
import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideDispatchService } from './ride-dispatch.service';
import {
  RIDE_DISPATCH_INTERVAL_MS,
  RIDE_SEARCH_RADII_METERS,
} from './ride-matching.constants';
import { RideTransitionsService } from './ride-transitions.service';

function createQueryBuilderMock<T>(rows: T[]) {
  const queryBuilder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    setLock: jest.fn(),
    innerJoin: jest.fn(),
    distinct: jest.fn(),
    getMany: jest.fn<Promise<T[]>, []>(() => Promise.resolve(rows)),
  };

  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  queryBuilder.orderBy.mockReturnValue(queryBuilder);
  queryBuilder.setLock.mockReturnValue(queryBuilder);
  queryBuilder.innerJoin.mockReturnValue(queryBuilder);
  queryBuilder.distinct.mockReturnValue(queryBuilder);

  return queryBuilder;
}

describe('RideDispatchService', () => {
  let service: RideDispatchService;
  let ride: Ride;
  let rideRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
  };
  let offerRepository: {
    update: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let driverLocationsService: {
    findNearbyAvailableDrivers: jest.Mock;
  };

  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  beforeEach(async () => {
    ride = {
      id: rideId,
      passengerUserId: 'f544d52a-39e0-4da3-8861-6010355c5dba',
      driverProfileId: null,
      status: RideStatus.SEARCHING_DRIVER,
      originPosition: {
        type: 'Point',
        coordinates: [-76.3599, -6.4877],
      },
      searchExpiresAt: new Date(Date.now() + 240_000),
      dispatchRound: 0,
      lastDispatchAt: null,
    } as Ride;

    rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
      find: jest.fn(() => Promise.resolve([])),
      save: jest.fn((entity: Ride) => Promise.resolve(entity)),
    };

    offerRepository = {
      update: jest.fn(() => Promise.resolve({ affected: 0 })),
      find: jest.fn(() => Promise.resolve([])),
      create: jest.fn((input: Partial<RideOffer>) => input as RideOffer),
      save: jest.fn((entities: RideOffer[]) => Promise.resolve(entities)),
    };

    const operationalState = {
      driverProfileId,
      status: DriverOperationalStatus.AVAILABLE,
    } as DriverOperationalState;
    const profile = {
      id: driverProfileId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const stateQueryBuilder = createQueryBuilderMock([operationalState]);
    const profileQueryBuilder = createQueryBuilderMock([profile]);
    const stateRepository = {
      createQueryBuilder: jest.fn(() => stateQueryBuilder),
    };
    const profileRepository = {
      createQueryBuilder: jest.fn(() => profileQueryBuilder),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) {
          return rideRepository;
        }

        if (entity === RideOffer) {
          return offerRepository;
        }

        if (entity === DriverOperationalState) {
          return stateRepository;
        }

        if (entity === DriverProfile) {
          return profileRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };
    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
    };

    driverLocationsService = {
      findNearbyAvailableDrivers: jest.fn(() =>
        Promise.resolve([
          {
            driverProfileId,
            distanceMeters: 420.4,
          },
        ]),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RideDispatchService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: DriverLocationsService,
          useValue: driverLocationsService,
        },
        {
          provide: RideTransitionsService,
          useValue: {
            expireWithinTransaction: jest.fn(
              (_manager: EntityManager, entity: Ride) => {
                entity.status = RideStatus.EXPIRED;
                return Promise.resolve();
              },
            ),
          },
        },
      ],
    }).compile();

    service = module.get<RideDispatchService>(RideDispatchService);
  });

  it('debe buscar a 2 kilómetros (G3B2) y crear ofertas para conductores elegibles', async () => {
    const result = await service.dispatchRide(rideId);

    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).toHaveBeenCalledWith(-6.4877, -76.3599, 2000, 25);
    expect(result).toHaveLength(1);
    expect(result[0]?.driverProfileId).toBe(driverProfileId);
    expect(result[0]?.distanceToOriginMeters).toBe(420);
    expect(result[0]?.status).toBe(RideOfferStatus.OFFERED);
    /*
     * G3B1: OFFERED ya no vive un TTL técnico corto — dura hasta
     * el final de la ventana real de búsqueda del Ride, igual que
     * ya hace PROPOSED.
     */
    expect(result[0]?.expiresAt).toEqual(ride.searchExpiresAt);
    expect(ride.dispatchRound).toBe(1);
  });

  it('debe fijar expiresAt exactamente igual al deadline global de búsqueda', async () => {
    ride.searchExpiresAt = new Date(Date.now() + 10_000);

    const result = await service.dispatchRide(rideId);

    expect(result).toHaveLength(1);
    expect(result[0]?.expiresAt).toEqual(ride.searchExpiresAt);
  });

  it('no debe buscar una nueva ronda si todavía no transcurrió RIDE_DISPATCH_INTERVAL_MS desde lastDispatchAt', async () => {
    ride.lastDispatchAt = new Date(Date.now() - 10_000);

    const activeOffer = {
      id: '0847d580-6282-4a15-a967-95cb93650d36',
      rideId,
      driverProfileId,
      status: RideOfferStatus.OFFERED,
      expiresAt: ride.searchExpiresAt,
    } as RideOffer;
    offerRepository.find.mockResolvedValueOnce([activeOffer]);

    const result = await service.dispatchRide(rideId);

    expect(result).toEqual([activeOffer]);
    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).not.toHaveBeenCalled();
    expect(ride.dispatchRound).toBe(0);
  });

  it('debe ejecutar la ronda 2 aunque la Offer de la ronda 1 siga OFFERED, una vez transcurrido el intervalo', async () => {
    ride.dispatchRound = 1;
    ride.lastDispatchAt = new Date(
      Date.now() - (RIDE_DISPATCH_INTERVAL_MS + 1_000),
    );

    /*
     * La Offer de la ronda 1 pertenece a OTRO Driver (todavía
     * OFFERED, sin tocar). El candidato de esta ronda 2 es el
     * Driver ya configurado como elegible en el beforeEach.
     */
    const existingOfferFromRoundOne = {
      id: 'offer-round-1',
      rideId,
      driverProfileId: 'a1a1a1a1-1111-4a11-9a11-1a1a1a1a1a1a',
      status: RideOfferStatus.OFFERED,
    } as RideOffer;

    offerRepository.find.mockImplementation((options: { select?: unknown }) => {
      // previousOffers query dentro de createOffersForPlan (dedup)
      if (options?.select) {
        return Promise.resolve([existingOfferFromRoundOne]);
      }

      return Promise.resolve([]);
    });

    const result = await service.dispatchRide(rideId);

    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).toHaveBeenCalledWith(-6.4877, -76.3599, 5000, 25);
    expect(ride.dispatchRound).toBe(2);
    expect(result).toHaveLength(1);
    expect(result[0]?.driverProfileId).toBe(driverProfileId);
    expect(result[0]?.expiresAt).toEqual(ride.searchExpiresAt);
  });

  it('no debe volver a ofertar a un Driver que ya tiene una fila histórica para ese Ride', async () => {
    ride.dispatchRound = 1;
    ride.lastDispatchAt = new Date(
      Date.now() - (RIDE_DISPATCH_INTERVAL_MS + 1_000),
    );

    const existingOfferA = {
      id: 'offer-a',
      rideId,
      driverProfileId,
      status: RideOfferStatus.OFFERED,
    } as RideOffer;

    offerRepository.find.mockImplementation((options: { select?: unknown }) => {
      if (options?.select) {
        return Promise.resolve([existingOfferA]);
      }

      return Promise.resolve([]);
    });

    // findNearbyAvailableDrivers vuelve a devolver al mismo Driver A
    driverLocationsService.findNearbyAvailableDrivers.mockResolvedValueOnce([
      {
        driverProfileId,
        distanceMeters: 900,
      },
    ]);

    const result = await service.dispatchRide(rideId);

    expect(result).toEqual([]);
    expect(offerRepository.save).not.toHaveBeenCalled();
  });

  it('debe ejecutar la ronda 3 (10000m, G3B2) tras la ronda 2, con A y B todavía OFFERED', async () => {
    ride.dispatchRound = 2;
    ride.lastDispatchAt = new Date(
      Date.now() - (RIDE_DISPATCH_INTERVAL_MS + 1_000),
    );

    const existingOffersFromRoundsOneAndTwo = [
      {
        id: 'offer-1',
        rideId,
        driverProfileId: 'a1a1a1a1-1111-4a11-9a11-1a1a1a1a1a1a',
        status: RideOfferStatus.OFFERED,
      } as RideOffer,
      {
        id: 'offer-2',
        rideId,
        driverProfileId: 'b2b2b2b2-2222-4b22-9b22-2b2b2b2b2b2b',
        status: RideOfferStatus.OFFERED,
      } as RideOffer,
    ];

    offerRepository.find.mockImplementation((options: { select?: unknown }) => {
      if (options?.select) {
        return Promise.resolve(existingOffersFromRoundsOneAndTwo);
      }

      return Promise.resolve([]);
    });

    const result = await service.dispatchRide(rideId);

    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).toHaveBeenCalledWith(-6.4877, -76.3599, 10000, 25);
    expect(ride.dispatchRound).toBe(3);
    expect(result).toHaveLength(1);
    expect(result[0]?.searchRadiusMeters).toBe(10000);
  });

  it('G3C-lite: primer reintento en radio máximo tras agotar las 3 rondas reutiliza 10000m (G3B2) sin crecer dispatchRound', async () => {
    ride.dispatchRound = 3;
    ride.lastDispatchAt = new Date(
      Date.now() - (RIDE_DISPATCH_INTERVAL_MS + 1_000),
    );

    const existingOffersFromPreviousRounds = [
      {
        id: 'offer-1',
        rideId,
        driverProfileId: 'a1a1a1a1-1111-4a11-9a11-1a1a1a1a1a1a',
        status: RideOfferStatus.OFFERED,
      } as RideOffer,
      {
        id: 'offer-2',
        rideId,
        driverProfileId: 'b2b2b2b2-2222-4b22-9b22-2b2b2b2b2b2b',
        status: RideOfferStatus.OFFERED,
      } as RideOffer,
      {
        id: 'offer-3',
        rideId,
        driverProfileId: 'c3c3c3c3-3333-4c33-9c33-3c3c3c3c3c3c',
        status: RideOfferStatus.OFFERED,
      } as RideOffer,
    ];

    offerRepository.find.mockImplementation((options: { select?: unknown }) => {
      if (options?.select) {
        return Promise.resolve(existingOffersFromPreviousRounds);
      }

      return Promise.resolve([]);
    });

    const result = await service.dispatchRide(rideId);

    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).toHaveBeenCalledWith(-6.4877, -76.3599, 10000, 25);
    expect(ride.dispatchRound).toBe(3);
    expect(result).toHaveLength(1);
    expect(result[0]?.driverProfileId).toBe(driverProfileId);
    expect(result[0]?.searchRadiusMeters).toBe(10000);
    expect(result[0]?.dispatchRound).toBe(3);
  });

  it('G3C-lite: antes de RIDE_DISPATCH_INTERVAL_MS en radio máximo, no reintenta', async () => {
    ride.dispatchRound = 3;
    ride.lastDispatchAt = new Date(Date.now() - 10_000);

    const activeOffer = {
      id: 'offer-a',
      rideId,
      driverProfileId,
      status: RideOfferStatus.OFFERED,
      expiresAt: ride.searchExpiresAt,
    } as RideOffer;
    offerRepository.find.mockResolvedValueOnce([activeOffer]);

    const result = await service.dispatchRide(rideId);

    expect(result).toEqual([activeOffer]);
    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).not.toHaveBeenCalled();
    expect(ride.dispatchRound).toBe(3);
  });

  it('G3C-lite: un segundo reintento en radio máximo vuelve a usar 10000m (G3B2) y dispatchRound sigue saturado', async () => {
    ride.dispatchRound = 3;
    ride.lastDispatchAt = new Date(
      Date.now() - (RIDE_DISPATCH_INTERVAL_MS + 1_000),
    );
    offerRepository.find.mockImplementation((options: { select?: unknown }) => {
      if (options?.select) {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    });

    const firstAttempt = await service.dispatchRide(rideId);

    expect(firstAttempt).toHaveLength(1);
    expect(ride.dispatchRound).toBe(3);

    const firstOfferId = firstAttempt[0].id;
    ride.lastDispatchAt = new Date(
      Date.now() - (RIDE_DISPATCH_INTERVAL_MS + 1_000),
    );
    offerRepository.find.mockImplementation((options: { select?: unknown }) => {
      if (options?.select) {
        return Promise.resolve([
          { id: firstOfferId, rideId, driverProfileId } as RideOffer,
        ]);
      }

      return Promise.resolve([]);
    });

    const secondAttempt = await service.dispatchRide(rideId);

    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).toHaveBeenLastCalledWith(-6.4877, -76.3599, 10000, 25);
    expect(ride.dispatchRound).toBe(3);
    // El único candidato que Redis devuelve ya fue ofertado en el primer intento.
    expect(secondAttempt).toEqual([]);
  });

  it('G3C-lite: un reintento en radio máximo sin Drivers nuevos igual actualiza lastDispatchAt (evita hot-loop)', async () => {
    ride.dispatchRound = 3;
    ride.lastDispatchAt = new Date(
      Date.now() - (RIDE_DISPATCH_INTERVAL_MS + 1_000),
    );

    const alreadyOffered = {
      id: 'offer-a',
      rideId,
      driverProfileId,
      status: RideOfferStatus.OFFERED,
    } as RideOffer;
    offerRepository.find.mockImplementation((options: { select?: unknown }) => {
      if (options?.select) {
        return Promise.resolve([alreadyOffered]);
      }

      return Promise.resolve([]);
    });

    const before = ride.lastDispatchAt;

    const result = await service.dispatchRide(rideId);

    expect(result).toEqual([]);
    expect(ride.dispatchRound).toBe(3);
    expect(ride.lastDispatchAt).not.toEqual(before);
    expect(ride.lastDispatchAt).toBeInstanceOf(Date);
  });

  it('debe avanzar la ronda aunque no encuentre candidatos', async () => {
    driverLocationsService.findNearbyAvailableDrivers.mockResolvedValue([]);

    const result = await service.dispatchRide(rideId);

    expect(result).toEqual([]);
    expect(ride.dispatchRound).toBe(1);
    expect(ride.lastDispatchAt).toBeInstanceOf(Date);
  });

  it('debe expirar un viaje cuya búsqueda terminó', async () => {
    ride.searchExpiresAt = new Date(Date.now() - 1000);

    const result = await service.dispatchRide(rideId);

    expect(result).toEqual([]);
    expect(ride.status).toBe(RideStatus.EXPIRED);
    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).not.toHaveBeenCalled();
  });
});

function createChainableQueryBuilderMock<T>(result: T | null) {
  const queryBuilder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn<Promise<T | null>, []>(() => Promise.resolve(result)),
  };

  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  queryBuilder.setLock.mockReturnValue(queryBuilder);

  return queryBuilder;
}

interface LateJoinContextOverrides {
  ride?: Omit<Partial<Ride>, 'id'>;
  existingOffer?: RideOffer | null;
  state?: Partial<DriverOperationalState> | null;
  profile?: Partial<DriverProfile> | null;
  vehicle?: Partial<DriverVehicle> | null;
  documents?: DriverDocument[];
  location?: Partial<DriverLocation> | null;
  activeRide?: Ride | null;
  distanceMeters?: number | null;
  candidateRideIds?: string[];
  lockAcquired?: boolean;
  withOutbox?: boolean;
}

describe('RideDispatchService.dispatchLateJoinDriver (G3A)', () => {
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
  const otherRideId = 'd9d1f0f0-4d3b-4e1a-9b7a-6c5b1a2e9f10';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
  const now = new Date();

  function buildContext(overrides: LateJoinContextOverrides = {}) {
    const candidateIds = overrides.candidateRideIds ?? [rideId];
    const ridesById = new Map<string, Ride>(
      candidateIds.map((id) => [
        id,
        {
          status: RideStatus.SEARCHING_DRIVER,
          searchExpiresAt: new Date(now.getTime() + 240_000),
          dispatchRound: 1,
          ...overrides.ride,
          id,
        } as Ride,
      ]),
    );
    const ride = ridesById.get(rideId) as Ride;

    const savedOffers: RideOffer[] = [];

    const offerRepository = {
      findOne: jest.fn(() =>
        Promise.resolve(
          overrides.existingOffer === undefined
            ? null
            : overrides.existingOffer,
        ),
      ),
      create: jest.fn((input: Partial<RideOffer>) => input as RideOffer),
      save: jest.fn((entity: RideOffer) => {
        savedOffers.push(entity);
        return Promise.resolve({
          ...entity,
          id: entity.id ?? 'offer-id',
        });
      }),
    };

    const rideRepository = {
      findOne: jest.fn(
        (options: { where: Record<string, unknown> }): Promise<Ride | null> => {
          if ('id' in options.where) {
            return Promise.resolve(
              ridesById.get(options.where.id as string) ?? null,
            );
          }

          return Promise.resolve(
            overrides.activeRide === undefined ? null : overrides.activeRide,
          );
        },
      ),
    };

    const stateResult =
      overrides.state === undefined
        ? ({
            driverProfileId,
            status: DriverOperationalStatus.AVAILABLE,
            lastSeenAt: now,
          } as DriverOperationalState)
        : (overrides.state as DriverOperationalState | null);
    const stateQueryBuilder = createChainableQueryBuilderMock(stateResult);
    const stateRepository = {
      createQueryBuilder: jest.fn(() => stateQueryBuilder),
    };

    const profileResult =
      overrides.profile === undefined
        ? ({
            id: driverProfileId,
            status: DriverStatus.APPROVED,
          } as DriverProfile)
        : (overrides.profile as DriverProfile | null);
    const profileRepository = {
      findOne: jest.fn(() => Promise.resolve(profileResult)),
    };

    const vehicleResult =
      overrides.vehicle === undefined
        ? ({
            driverProfileId,
            status: VehicleStatus.APPROVED,
          } as DriverVehicle)
        : (overrides.vehicle as DriverVehicle | null);
    const vehicleRepository = {
      findOne: jest.fn(() => Promise.resolve(vehicleResult)),
    };

    const documentsResult =
      overrides.documents ??
      ([
        {
          type: DriverDocumentType.DRIVER_LICENSE,
          status: DriverDocumentStatus.APPROVED,
          expiresAt: '2999-01-01',
        },
        {
          type: DriverDocumentType.SOAT,
          status: DriverDocumentStatus.APPROVED,
          expiresAt: '2999-01-01',
        },
      ] as DriverDocument[]);
    const documentRepository = {
      find: jest.fn(() => Promise.resolve(documentsResult)),
    };

    const locationResult =
      overrides.location === undefined
        ? ({
            driverProfileId,
            recordedAt: now,
          } as DriverLocation)
        : (overrides.location as DriverLocation | null);
    const locationRepository = {
      findOne: jest.fn(() => Promise.resolve(locationResult)),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) return rideRepository;
        if (entity === RideOffer) return offerRepository;
        if (entity === DriverOperationalState) return stateRepository;
        if (entity === DriverProfile) return profileRepository;
        if (entity === DriverVehicle) return vehicleRepository;
        if (entity === DriverDocument) return documentRepository;
        if (entity === DriverLocation) return locationRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() =>
        Promise.resolve(
          overrides.distanceMeters === null
            ? [{ distanceMeters: null }]
            : [
                {
                  distanceMeters: String(overrides.distanceMeters ?? 1_500),
                },
              ],
        ),
      ),
    };

    const lockAcquired = overrides.lockAcquired ?? true;
    const queryRunner = {
      connect: jest.fn(() => Promise.resolve()),
      query: jest.fn((sql: string) => {
        if (typeof sql === 'string' && sql.includes('pg_try_advisory_lock')) {
          return Promise.resolve([{ locked: lockAcquired }]);
        }

        return Promise.resolve([{ unlocked: true }]);
      }),
      release: jest.fn(() => Promise.resolve()),
    };

    const transactionMock = jest.fn(
      <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
        work(managerMock as unknown as EntityManager),
    );
    const topLevelQueryMock = jest.fn<
      Promise<Array<{ id: string }>>,
      [string, unknown[]?]
    >(() => Promise.resolve(candidateIds.map((id) => ({ id }))));
    const createQueryRunnerMock = jest.fn(() => queryRunner);
    const dataSourceMock = {
      transaction: transactionMock,
      query: topLevelQueryMock,
      createQueryRunner: createQueryRunnerMock,
    } as unknown as DataSource;

    const driverLocationsService = {
      findNearbyAvailableDrivers: jest.fn(),
    } as unknown as DriverLocationsService;

    const transitionsService = {
      expireWithinTransaction: jest.fn(() => Promise.resolve()),
    } as unknown as RideTransitionsService;

    const enqueueWithinTransactionMock = jest.fn<
      Promise<unknown>,
      [
        unknown,
        {
          aggregateType: string;
          eventType: OutboxEventType;
          payload: { rideId: string; driverProfileId: string };
        },
      ]
    >(() => Promise.resolve());
    const outboxService = overrides.withOutbox
      ? ({
          enqueueWithinTransaction: enqueueWithinTransactionMock,
        } as unknown as OutboxService)
      : undefined;

    const service = new RideDispatchService(
      dataSourceMock,
      driverLocationsService,
      transitionsService,
      outboxService,
    );

    return {
      service,
      ride,
      savedOffers,
      offerRepository,
      rideRepository,
      queryRunner,
      transactionMock,
      enqueueWithinTransactionMock,
      topLevelQueryMock,
    };
  }

  it('G3B2: la query preliminar de late-join usa el nuevo radio máximo (10000m), no el viejo 3000m', async () => {
    const ctx = buildContext();

    await ctx.service.dispatchLateJoinDriver(driverProfileId);

    const [, params] = ctx.topLevelQueryMock.mock.calls[0];
    const radiusUsed = params?.[1];

    /*
     * Con el límite viejo (3000m) este assert habría fallado: la
     * query preliminar de findNearbySearchingRideIds habría enviado
     * 3000 en vez del nuevo MAX_SEARCH_RADIUS_METERS (10000).
     */
    expect(radiusUsed).toBe(10_000);
    expect(radiusUsed).not.toBe(3_000);
  });

  it('crea una oferta cuando el Ride ya existía y el Driver queda descubrible dentro del radio', async () => {
    const ctx = buildContext();

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toHaveLength(1);
    expect(ctx.savedOffers[0].status).toBe(RideOfferStatus.OFFERED);
    expect(ctx.savedOffers[0].rideId).toBe(rideId);
    expect(ctx.savedOffers[0].driverProfileId).toBe(driverProfileId);
    expect(ctx.savedOffers[0].dispatchRound).toBe(1);
    expect(ctx.savedOffers[0].searchRadiusMeters).toBe(
      RIDE_SEARCH_RADII_METERS[1],
    );
    expect(ctx.ride.dispatchRound).toBe(1);
    /*
     * G3B1: la Offer de late-join también persiste hasta el final
     * de la ventana real de búsqueda, no un TTL técnico corto.
     */
    expect(ctx.savedOffers[0].expiresAt).toEqual(ctx.ride.searchExpiresAt);
  });

  it('debe reutilizar exactamente el mismo mecanismo de outbox que el dispatch normal', async () => {
    const ctx = buildContext({ withOutbox: true });

    await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(ctx.enqueueWithinTransactionMock).toHaveBeenCalledTimes(1);

    const [, enqueuedEvent] = ctx.enqueueWithinTransactionMock.mock.calls[0];

    expect(enqueuedEvent.aggregateType).toBe('RIDE_OFFER');
    expect(enqueuedEvent.eventType).toBe(OutboxEventType.RIDE_OFFER_CREATED);
    expect(enqueuedEvent.payload.rideId).toBe(rideId);
    expect(enqueuedEvent.payload.driverProfileId).toBe(driverProfileId);
  });

  it('no debe crear oferta si el Ride ya expiró', async () => {
    const ctx = buildContext({
      ride: { searchExpiresAt: new Date(now.getTime() - 1_000) },
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.offerRepository.save).not.toHaveBeenCalled();
  });

  it('no debe crear oferta si el Ride ya fue asignado', async () => {
    const ctx = buildContext({
      ride: { status: RideStatus.DRIVER_ASSIGNED },
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.offerRepository.save).not.toHaveBeenCalled();
  });

  it('no debe crear oferta si el Driver está fuera del radio ya alcanzado por el Ride', async () => {
    const ctx = buildContext({
      ride: { dispatchRound: 1 },
      distanceMeters: RIDE_SEARCH_RADII_METERS[1] + 1,
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.offerRepository.save).not.toHaveBeenCalled();
  });

  it('debe crear oferta si el Driver está dentro del radio ya alcanzado por el Ride', async () => {
    const ctx = buildContext({
      ride: { dispatchRound: 2 },
      distanceMeters: RIDE_SEARCH_RADII_METERS[2] - 1,
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toHaveLength(1);
    expect(ctx.savedOffers[0].searchRadiusMeters).toBe(
      RIDE_SEARCH_RADII_METERS[2],
    );
  });

  it('G3C-lite: con la ride en reintentos de radio máximo (dispatchRound > 3), late-join sigue usando el radio máximo (G3B2: 10000m)', async () => {
    const ctx = buildContext({
      ride: { dispatchRound: 7 },
      distanceMeters: RIDE_SEARCH_RADII_METERS[2] - 1,
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toHaveLength(1);
    expect(ctx.savedOffers[0].searchRadiusMeters).toBe(
      RIDE_SEARCH_RADII_METERS[2],
    );
    expect(ctx.savedOffers[0].dispatchRound).toBe(7);
  });

  it('no debe duplicar oferta si el Driver ya tuvo cualquier RideOffer previa para ese Ride', async () => {
    const ctx = buildContext({
      existingOffer: {
        id: 'previous-offer',
        rideId,
        driverProfileId,
        status: RideOfferStatus.EXPIRED,
      } as RideOffer,
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.offerRepository.save).not.toHaveBeenCalled();
  });

  it('no debe crear oferta si el Driver tiene un Ride activo asignado', async () => {
    const ctx = buildContext({
      activeRide: { id: 'other-ride' } as Ride,
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.offerRepository.save).not.toHaveBeenCalled();
  });

  it('no debe crear oferta si el perfil del Driver no está APPROVED', async () => {
    const ctx = buildContext({
      profile: { id: driverProfileId, status: DriverStatus.SUSPENDED },
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.offerRepository.save).not.toHaveBeenCalled();
  });

  it('no debe crear oferta si el vehículo del Driver no está APPROVED', async () => {
    const ctx = buildContext({
      vehicle: { driverProfileId, status: VehicleStatus.PENDING_REVIEW },
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.offerRepository.save).not.toHaveBeenCalled();
  });

  it('no debe crear oferta si la ubicación del Driver no está fresca', async () => {
    const ctx = buildContext({
      location: {
        driverProfileId,
        recordedAt: new Date(now.getTime() - 120_000),
      },
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.offerRepository.save).not.toHaveBeenCalled();
  });

  it('no debe crear oferta si el Driver no está AVAILABLE', async () => {
    const ctx = buildContext({ state: null });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.offerRepository.save).not.toHaveBeenCalled();
  });

  it('no asigna el Ride: solo puede crear una oferta OFFERED', async () => {
    const ctx = buildContext();

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers[0].status).toBe(RideOfferStatus.OFFERED);
    expect(ctx.ride.status).toBe(RideStatus.SEARCHING_DRIVER);
    expect(ctx.ride.driverProfileId ?? null).toBeNull();
  });

  it('dos Rides vigentes cercanos: crea una oferta por cada uno, sin límite artificial nuevo', async () => {
    const ctx = buildContext({
      candidateRideIds: [rideId, otherRideId],
    });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toHaveLength(2);
    expect(ctx.offerRepository.save).toHaveBeenCalledTimes(2);
  });

  it('concurrencia: si el worker de rondas ya tiene el advisory lock del Ride, no intenta crear oferta', async () => {
    const ctx = buildContext({ lockAcquired: false });

    const offers = await ctx.service.dispatchLateJoinDriver(driverProfileId);

    expect(offers).toEqual([]);
    expect(ctx.transactionMock).not.toHaveBeenCalled();
    expect(ctx.queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
