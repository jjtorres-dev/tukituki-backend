import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager, FindOneOptions } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import type { RedisGeoSearchResult } from '../../infrastructure/redis/redis.service';
import { RideRealtimeService } from '../rides/realtime/ride-realtime.service';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { IdentityDocumentType } from '../drivers/enums/identity-document-type.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';
import { VehicleType } from '../drivers/enums/vehicle-type.enum';
import { Ride } from '../rides/entities/ride.entity';
import { RideStatus } from '../rides/enums/ride-status.enum';
import { DriverLocationsService } from './driver-locations.service';
import { RideProgressTrackingService } from './ride-progress-tracking.service';
import { DriverLocation } from './entities/driver-location.entity';
import { DriverOperationalState } from './entities/driver-operational-state.entity';
import { DriverOperationalStatus } from './enums/driver-operational-status.enum';

type QueryBuilderMock<T> = {
  innerJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  setLock: jest.Mock;
  getOne: jest.Mock<Promise<T | null>, []>;
  getMany: jest.Mock<Promise<T[]>, []>;
};

function createQueryBuilderMock<T>(): QueryBuilderMock<T> {
  const queryBuilder = {} as QueryBuilderMock<T>;

  queryBuilder.innerJoin = jest.fn(() => queryBuilder);

  queryBuilder.where = jest.fn(() => queryBuilder);

  queryBuilder.andWhere = jest.fn(() => queryBuilder);

  queryBuilder.setLock = jest.fn(() => queryBuilder);

  queryBuilder.getOne = jest.fn<Promise<T | null>, []>(() =>
    Promise.resolve(null),
  );

  queryBuilder.getMany = jest.fn<Promise<T[]>, []>(() => Promise.resolve([]));

  return queryBuilder;
}

describe('DriverLocationsService', () => {
  let service: DriverLocationsService;

  let profileQueryBuilder: QueryBuilderMock<DriverProfile>;

  let stateQueryBuilder: QueryBuilderMock<DriverOperationalState>;

  let locationQueryBuilder: QueryBuilderMock<DriverLocation>;

  let vehicleQueryBuilder: QueryBuilderMock<DriverVehicle>;

  let documentQueryBuilder: QueryBuilderMock<DriverDocument>;

  let activeRideQueryBuilder: QueryBuilderMock<Ride>;

  let eligibleStateQueryBuilder: QueryBuilderMock<DriverOperationalState>;

  let profileRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock<
      Promise<DriverProfile | null>,
      [FindOneOptions<DriverProfile>]
    >;
  };

  let stateRepository: {
    createQueryBuilder: jest.Mock;
    save: jest.Mock<Promise<DriverOperationalState>, [DriverOperationalState]>;
  };

  let locationRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock<
      Promise<DriverLocation | null>,
      [FindOneOptions<DriverLocation>]
    >;
    create: jest.Mock<DriverLocation, [Partial<DriverLocation>]>;
    save: jest.Mock<Promise<DriverLocation>, [DriverLocation]>;
  };

  let availabilityRedisService: {
    publishAvailableDriver: jest.Mock<Promise<void>, [string, number, number]>;
    registerBusyPresence: jest.Mock<Promise<void>, [string]>;
    renewPresenceIfExists: jest.Mock<Promise<boolean>, [string]>;
    findNearbyAvailableDrivers: jest.Mock<
      Promise<RedisGeoSearchResult[]>,
      [number, number, number, number]
    >;
    removeDriverAvailability: jest.Mock<Promise<void>, [string]>;
    registerDiscoverableTransition: jest.Mock<Promise<boolean>, [string]>;
  };

  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const profile: DriverProfile = {
    id: '72b81eb5-c53f-4de2-bd9f-11f33d64da64',
    userId,
    firstName: 'Juan José',
    lastName: 'Torres Solano',
    documentType: IdentityDocumentType.DNI,
    documentNumber: '12345678',
    birthDate: '1995-06-15',
    address: 'Jr. Los Jardines 245, Tarapoto',
    photoUrl: null,
    status: DriverStatus.APPROVED,
    rejectionReason: null,
    submittedAt: new Date(),
    approvedAt: new Date(),
    approvedByUserId: '97e761e2-ce3d-49cc-b0ed-c0ff3c313444',
    suspensionReason: null,
    suspendedAt: null,
    suspendedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverProfile;

  const availableState: DriverOperationalState = {
    id: 'c63c9943-77e2-49eb-a37a-38af6627bcb9',
    driverProfileId: profile.id,
    status: DriverOperationalStatus.AVAILABLE,
    connectedAt: new Date(),
    disconnectedAt: null,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverOperationalState;

  const vehicle: DriverVehicle = {
    id: '6a083c8e-37aa-46cb-82bb-6fd482072c73',
    driverProfileId: profile.id,
    plate: '1234-AB',
    brand: 'Bajaj',
    model: 'RE 4S',
    year: 2025,
    color: 'Rojo',
    engineNumber: 'ENG123456789',
    chassisNumber: 'CHS123456789',
    vehicleType: VehicleType.MOTOTAXI,
    status: VehicleStatus.APPROVED,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverVehicle;

  const license: DriverDocument = {
    id: '4a54fd37-89b6-43c8-bde3-4af9847cc8d0',
    driverProfileId: profile.id,
    type: DriverDocumentType.DRIVER_LICENSE,
    fileUrl: 'https://cdn.tukituki.pe/license.jpg',
    documentNumber: 'Q12345678',
    issuedAt: '2025-01-01',
    expiresAt: '2030-01-01',
    status: DriverDocumentStatus.APPROVED,
    rejectionReason: null,
    reviewedAt: new Date(),
    reviewedByUserId: '97e761e2-ce3d-49cc-b0ed-c0ff3c313444',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverDocument;

  const soat: DriverDocument = {
    ...license,
    id: 'bf368a55-7102-4522-9998-a3159fcd356d',
    type: DriverDocumentType.SOAT,
    documentNumber: 'SOAT123456',
  };

  const location: DriverLocation = {
    id: '066948cb-00b3-4805-bce6-954319b8e058',
    driverProfileId: profile.id,
    position: {
      type: 'Point',
      coordinates: [-76.3599, -6.4877],
    },
    latitude: -6.4877,
    longitude: -76.3599,
    heading: 90,
    speed: 7.5,
    accuracy: 8,
    recordedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverLocation;

  beforeEach(async () => {
    profileQueryBuilder = createQueryBuilderMock<DriverProfile>();

    stateQueryBuilder = createQueryBuilderMock<DriverOperationalState>();

    locationQueryBuilder = createQueryBuilderMock<DriverLocation>();

    vehicleQueryBuilder = createQueryBuilderMock<DriverVehicle>();

    documentQueryBuilder = createQueryBuilderMock<DriverDocument>();

    activeRideQueryBuilder = createQueryBuilderMock<Ride>();

    eligibleStateQueryBuilder =
      createQueryBuilderMock<DriverOperationalState>();

    profileRepository = {
      createQueryBuilder: jest.fn(() => profileQueryBuilder),
      findOne: jest.fn<
        Promise<DriverProfile | null>,
        [FindOneOptions<DriverProfile>]
      >(() => Promise.resolve(null)),
    };

    stateRepository = {
      createQueryBuilder: jest.fn(() => stateQueryBuilder),
      save: jest.fn(
        (entity: DriverOperationalState): Promise<DriverOperationalState> =>
          Promise.resolve(entity),
      ),
    };

    locationRepository = {
      createQueryBuilder: jest.fn(() => locationQueryBuilder),
      findOne: jest.fn<
        Promise<DriverLocation | null>,
        [FindOneOptions<DriverLocation>]
      >(() => Promise.resolve(null)),
      create: jest.fn(
        (input: Partial<DriverLocation>): DriverLocation =>
          input as DriverLocation,
      ),
      save: jest.fn((entity: DriverLocation): Promise<DriverLocation> =>
        Promise.resolve({
          ...entity,
          id: entity.id ?? location.id,
          createdAt: entity.createdAt ?? new Date(),
          updatedAt: entity.updatedAt ?? new Date(),
        }),
      ),
    };

    availabilityRedisService = {
      publishAvailableDriver: jest.fn<Promise<void>, [string, number, number]>(
        () => Promise.resolve(),
      ),

      registerBusyPresence: jest.fn<Promise<void>, [string]>(() =>
        Promise.resolve(),
      ),

      renewPresenceIfExists: jest.fn<Promise<boolean>, [string]>(() =>
        Promise.resolve(true),
      ),

      findNearbyAvailableDrivers: jest.fn<
        Promise<RedisGeoSearchResult[]>,
        [number, number, number, number]
      >(() => Promise.resolve([])),

      removeDriverAvailability: jest.fn<Promise<void>, [string]>(() =>
        Promise.resolve(),
      ),

      registerDiscoverableTransition: jest.fn<Promise<boolean>, [string]>(() =>
        Promise.resolve(true),
      ),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) {
          return profileRepository;
        }

        if (entity === DriverOperationalState) {
          return stateRepository;
        }

        if (entity === DriverLocation) {
          return locationRepository;
        }

        if (entity === DriverVehicle) {
          return {
            createQueryBuilder: jest.fn(() => vehicleQueryBuilder),
          };
        }

        if (entity === DriverDocument) {
          return {
            createQueryBuilder: jest.fn(() => documentQueryBuilder),
          };
        }

        if (entity === Ride) {
          return {
            createQueryBuilder: jest.fn(() => activeRideQueryBuilder),
          };
        }

        throw new Error('Repositorio transaccional inesperado');
      }),
    };

    const stateSearchRepository = {
      createQueryBuilder: jest.fn(() => eligibleStateQueryBuilder),
    };

    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),

      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverOperationalState) {
          return stateSearchRepository;
        }

        throw new Error('Repositorio de búsqueda inesperado');
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverLocationsService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: DriverAvailabilityRedisService,
          useValue: availabilityRedisService,
        },
        {
          provide: RideRealtimeService,
          useValue: {
            emitDriverLocation: jest.fn(() => Promise.resolve()),
            emitProgress: jest.fn(),
          },
        },
        {
          provide: RideProgressTrackingService,
          useValue: {
            recordWithinTransaction: jest.fn(() => Promise.resolve(null)),
          },
        },
      ],
    }).compile();

    service = module.get<DriverLocationsService>(DriverLocationsService);

    profileQueryBuilder.getOne.mockResolvedValue({
      ...profile,
    });

    profileRepository.findOne.mockResolvedValue({
      ...profile,
    });

    stateQueryBuilder.getOne.mockResolvedValue({
      ...availableState,
    });

    locationQueryBuilder.getOne.mockResolvedValue(null);

    vehicleQueryBuilder.getOne.mockResolvedValue({
      ...vehicle,
    });

    documentQueryBuilder.getMany.mockResolvedValue([
      {
        ...license,
      },
      {
        ...soat,
      },
    ]);

    activeRideQueryBuilder.getOne.mockResolvedValue(null);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe crear y publicar la primera ubicación', async () => {
    const result = await service.updateMyLocation(userId, {
      latitude: -6.4877,
      longitude: -76.3599,
      heading: 90,
      speed: 7.5,
      accuracy: 8,
    });

    expect(result.latitude).toBe(-6.4877);

    expect(result.longitude).toBe(-76.3599);

    expect(locationRepository.create).toHaveBeenCalledTimes(1);

    expect(stateRepository.save).toHaveBeenCalledTimes(1);

    expect(
      availabilityRedisService.publishAvailableDriver,
    ).toHaveBeenCalledWith(profile.id, -76.3599, -6.4877);
  });

  it('debe actualizar una ubicación existente', async () => {
    locationQueryBuilder.getOne.mockResolvedValue({
      ...location,
    });

    const result = await service.updateMyLocation(userId, {
      latitude: -6.49,
      longitude: -76.36,
    });

    expect(result.latitude).toBe(-6.49);

    expect(result.longitude).toBe(-76.36);

    expect(locationRepository.create).not.toHaveBeenCalled();
  });

  it('debe reconstruir presence desde ubicación y reiniciar connectedAt tras el TTL', async () => {
    const previousConnectedAt = new Date('2026-08-10T10:00:00.000Z');

    availabilityRedisService.renewPresenceIfExists.mockResolvedValue(false);

    stateQueryBuilder.getOne.mockResolvedValue({
      ...availableState,
      connectedAt: previousConnectedAt,
      lastSeenAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    await service.updateMyLocation(userId, {
      latitude: -6.4877,
      longitude: -76.3599,
    });

    const savedState = stateRepository.save.mock.calls[0][0];

    expect(savedState.connectedAt).toBeInstanceOf(Date);

    expect(savedState.connectedAt).not.toBe(previousConnectedAt);

    expect(savedState.lastSeenAt).toBeInstanceOf(Date);

    expect(
      availabilityRedisService.publishAvailableDriver,
    ).toHaveBeenCalledWith(profile.id, -76.3599, -6.4877);
  });

  it('no debe reconstruir presence desde ubicación con documentos vencidos', async () => {
    availabilityRedisService.renewPresenceIfExists.mockResolvedValue(false);

    documentQueryBuilder.getMany.mockResolvedValue([
      {
        ...license,
      },
      {
        ...soat,
        expiresAt: '2020-01-01',
      },
    ]);

    await expect(
      service.updateMyLocation(userId, {
        latitude: -6.4877,
        longitude: -76.3599,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(locationRepository.save).not.toHaveBeenCalled();

    expect(
      availabilityRedisService.publishAvailableDriver,
    ).not.toHaveBeenCalled();
  });

  it('no debe reconstruir presence desde ubicación si existe Ride activo', async () => {
    availabilityRedisService.renewPresenceIfExists.mockResolvedValue(false);

    activeRideQueryBuilder.getOne.mockResolvedValue({
      id: 'ef8cddab-f4a2-41f0-a5a8-e3d3a466480e',
      driverProfileId: profile.id,
      status: RideStatus.DRIVER_ASSIGNED,
    } as Ride);

    await expect(
      service.updateMyLocation(userId, {
        latitude: -6.4877,
        longitude: -76.3599,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      availabilityRedisService.publishAvailableDriver,
    ).not.toHaveBeenCalled();
  });

  it('debe mantener BUSY y publicar solo presencia BUSY tras el TTL', async () => {
    const connectedAt = new Date('2026-08-10T10:00:00.000Z');

    stateQueryBuilder.getOne.mockResolvedValue({
      ...availableState,
      status: DriverOperationalStatus.BUSY,
      connectedAt,
      lastSeenAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    await service.updateMyLocation(userId, {
      latitude: -6.4877,
      longitude: -76.3599,
    });

    const savedState = stateRepository.save.mock.calls[0][0];

    expect(savedState.status).toBe(DriverOperationalStatus.BUSY);

    expect(savedState.connectedAt).toBe(connectedAt);

    expect(
      availabilityRedisService.renewPresenceIfExists,
    ).not.toHaveBeenCalled();

    expect(availabilityRedisService.registerBusyPresence).toHaveBeenCalledWith(
      profile.id,
    );
  });

  it('debe compensar a OFFLINE si Redis falla al publicar AVAILABLE', async () => {
    const recoveringState = {
      ...availableState,
      connectedAt: new Date('2026-08-10T10:00:00.000Z'),
      lastSeenAt: new Date(),
    };

    stateQueryBuilder.getOne.mockResolvedValue(recoveringState);

    availabilityRedisService.publishAvailableDriver.mockRejectedValue(
      new Error('Redis no disponible'),
    );

    await expect(
      service.updateMyLocation(userId, {
        latitude: -6.4877,
        longitude: -76.3599,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(recoveringState.status).toBe(DriverOperationalStatus.OFFLINE);

    expect(recoveringState.disconnectedAt).toBeInstanceOf(Date);

    expect(
      availabilityRedisService.removeDriverAvailability,
    ).toHaveBeenCalledWith(profile.id);
  });

  it('debe rechazar actualización cuando está OFFLINE', async () => {
    stateQueryBuilder.getOne.mockResolvedValue({
      ...availableState,
      status: DriverOperationalStatus.OFFLINE,
    });

    await expect(
      service.updateMyLocation(userId, {
        latitude: -6.4877,
        longitude: -76.3599,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(locationRepository.save).not.toHaveBeenCalled();
  });

  it('debe rechazar las coordenadas 0,0', async () => {
    await expect(
      service.updateMyLocation(userId, {
        latitude: 0,
        longitude: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(profileQueryBuilder.getOne).not.toHaveBeenCalled();
  });

  it('debe responder 404 si todavía no existe ubicación', async () => {
    locationRepository.findOne.mockResolvedValue(null);

    await expect(service.getMyLocation(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('debe conservar orden y filtrar candidatos no elegibles', async () => {
    const otherDriverId = '4d5a8362-771f-4ff3-bc35-c08a942aa02d';

    availabilityRedisService.findNearbyAvailableDrivers.mockResolvedValue([
      {
        member: profile.id,
        distanceMeters: 120,
      },
      {
        member: otherDriverId,
        distanceMeters: 350,
      },
    ]);

    eligibleStateQueryBuilder.getMany.mockResolvedValue([
      {
        ...availableState,
      },
    ]);

    const result = await service.findNearbyAvailableDrivers(
      -6.4877,
      -76.3599,
      3000,
      20,
    );

    expect(result).toEqual([
      {
        driverProfileId: profile.id,
        distanceMeters: 120,
      },
    ]);

    expect(
      availabilityRedisService.removeDriverAvailability,
    ).toHaveBeenCalledWith(otherDriverId);
  });

  it('debe evaluar la transición discoverable en cada publicación AVAILABLE (G3A)', async () => {
    await service.updateMyLocation(userId, {
      latitude: -6.4877,
      longitude: -76.3599,
    });

    expect(
      availabilityRedisService.registerDiscoverableTransition,
    ).toHaveBeenCalledWith(profile.id);
  });

  it('no debe evaluar la transición discoverable mientras el conductor está BUSY (G3A)', async () => {
    stateQueryBuilder.getOne.mockResolvedValue({
      ...availableState,
      status: DriverOperationalStatus.BUSY,
    });

    await service.updateMyLocation(userId, {
      latitude: -6.4877,
      longitude: -76.3599,
    });

    expect(
      availabilityRedisService.registerDiscoverableTransition,
    ).not.toHaveBeenCalled();
  });

  it('no debe fallar la actualización si la detección de late-join falla (best-effort) (G3A)', async () => {
    availabilityRedisService.registerDiscoverableTransition.mockRejectedValue(
      new Error('Redis no disponible'),
    );

    const result = await service.updateMyLocation(userId, {
      latitude: -6.4877,
      longitude: -76.3599,
    });

    expect(result.latitude).toBe(-6.4877);
  });

  it('no debe consultar PostgreSQL si Redis excluye presence vencida', async () => {
    availabilityRedisService.findNearbyAvailableDrivers.mockResolvedValue([]);

    const result = await service.findNearbyAvailableDrivers(
      -6.4877,
      -76.3599,
      3000,
      20,
    );

    expect(result).toEqual([]);

    expect(eligibleStateQueryBuilder.getMany).not.toHaveBeenCalled();
  });
});
