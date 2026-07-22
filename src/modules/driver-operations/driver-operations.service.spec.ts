import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { IdentityDocumentType } from '../drivers/enums/identity-document-type.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';
import { VehicleType } from '../drivers/enums/vehicle-type.enum';
import { DriverOperationsService } from './driver-operations.service';
import { DriverOperationalState } from './entities/driver-operational-state.entity';
import { DriverOperationalStatus } from './enums/driver-operational-status.enum';

type QueryBuilderMock<T> = {
  where: jest.Mock;
  andWhere: jest.Mock;
  setLock: jest.Mock;
  getOne: jest.Mock<Promise<T | null>, []>;
  getMany: jest.Mock<Promise<T[]>, []>;
};

function createQueryBuilderMock<T>(): QueryBuilderMock<T> {
  const queryBuilder = {} as QueryBuilderMock<T>;

  queryBuilder.where = jest.fn(() => queryBuilder);

  queryBuilder.andWhere = jest.fn(() => queryBuilder);

  queryBuilder.setLock = jest.fn(() => queryBuilder);

  queryBuilder.getOne = jest.fn<Promise<T | null>, []>(() =>
    Promise.resolve(null),
  );

  queryBuilder.getMany = jest.fn<Promise<T[]>, []>(() => Promise.resolve([]));

  return queryBuilder;
}

describe('DriverOperationsService', () => {
  let service: DriverOperationsService;

  let profileQueryBuilder: QueryBuilderMock<DriverProfile>;

  let vehicleQueryBuilder: QueryBuilderMock<DriverVehicle>;

  let documentQueryBuilder: QueryBuilderMock<DriverDocument>;

  let stateQueryBuilder: QueryBuilderMock<DriverOperationalState>;

  let stateRepository: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  let availabilityRedisService: {
    removeDriverAvailability: jest.Mock<Promise<void>, [string]>;
    renewPresenceIfExists: jest.Mock<Promise<boolean>, [string]>;
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

  const offlineState: DriverOperationalState = {
    id: 'c63c9943-77e2-49eb-a37a-38af6627bcb9',
    driverProfileId: profile.id,
    status: DriverOperationalStatus.OFFLINE,
    connectedAt: null,
    disconnectedAt: null,
    lastSeenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverOperationalState;

  beforeEach(async () => {
    profileQueryBuilder = createQueryBuilderMock<DriverProfile>();

    vehicleQueryBuilder = createQueryBuilderMock<DriverVehicle>();

    documentQueryBuilder = createQueryBuilderMock<DriverDocument>();

    stateQueryBuilder = createQueryBuilderMock<DriverOperationalState>();

    const profileRepository = {
      createQueryBuilder: jest.fn(() => profileQueryBuilder),
    };

    const vehicleRepository = {
      createQueryBuilder: jest.fn(() => vehicleQueryBuilder),
    };

    const documentRepository = {
      createQueryBuilder: jest.fn(() => documentQueryBuilder),
    };

    stateRepository = {
      createQueryBuilder: jest.fn(() => stateQueryBuilder),

      create: jest.fn(
        (input: Partial<DriverOperationalState>): DriverOperationalState =>
          input as DriverOperationalState,
      ),

      save: jest.fn(
        (entity: DriverOperationalState): Promise<DriverOperationalState> =>
          Promise.resolve(entity),
      ),
    };

    availabilityRedisService = {
      removeDriverAvailability: jest.fn<Promise<void>, [string]>(() =>
        Promise.resolve(),
      ),
      renewPresenceIfExists: jest.fn<Promise<boolean>, [string]>(() =>
        Promise.resolve(true),
      ),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) {
          return profileRepository;
        }

        if (entity === DriverVehicle) {
          return vehicleRepository;
        }

        if (entity === DriverDocument) {
          return documentRepository;
        }

        if (entity === DriverOperationalState) {
          return stateRepository;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverOperationsService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: DriverAvailabilityRedisService,
          useValue: availabilityRedisService,
        },
      ],
    }).compile();

    service = module.get<DriverOperationsService>(DriverOperationsService);

    profileQueryBuilder.getOne.mockResolvedValue({
      ...profile,
    });

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

    stateQueryBuilder.getOne.mockResolvedValue(null);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe crear el estado inicial como OFFLINE', async () => {
    const result = await service.getMyStatus(userId);

    expect(result.status).toBe(DriverOperationalStatus.OFFLINE);

    expect(stateRepository.save).toHaveBeenCalledTimes(1);
  });

  it('debe conectar al conductor como AVAILABLE', async () => {
    stateQueryBuilder.getOne.mockResolvedValue({
      ...offlineState,
    });

    const result = await service.goOnline(userId);

    expect(result.status).toBe(DriverOperationalStatus.AVAILABLE);

    expect(result.connectedAt).toBeInstanceOf(Date);

    expect(result.lastSeenAt).toBeInstanceOf(Date);

    expect(result.disconnectedAt).toBeNull();

    expect(
      availabilityRedisService.removeDriverAvailability,
    ).toHaveBeenCalledWith(profile.id);
  });

  it('debe impedir conexión sin perfil aprobado', async () => {
    profileQueryBuilder.getOne.mockResolvedValue({
      ...profile,
      status: DriverStatus.SUSPENDED,
    });

    await expect(service.goOnline(userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(vehicleQueryBuilder.getOne).not.toHaveBeenCalled();
  });

  it('debe impedir conexión con SOAT vencido', async () => {
    documentQueryBuilder.getMany.mockResolvedValue([
      {
        ...license,
      },
      {
        ...soat,
        expiresAt: '2020-01-01',
      },
    ]);

    await expect(service.goOnline(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('debe desconectar a un conductor disponible', async () => {
    stateQueryBuilder.getOne.mockResolvedValue({
      ...offlineState,
      status: DriverOperationalStatus.AVAILABLE,
      connectedAt: new Date(),
      lastSeenAt: new Date(),
    });

    const result = await service.goOffline(userId);

    expect(result.status).toBe(DriverOperationalStatus.OFFLINE);

    expect(result.disconnectedAt).toBeInstanceOf(Date);

    expect(
      availabilityRedisService.removeDriverAvailability,
    ).toHaveBeenCalledWith(profile.id);
  });

  it('debe impedir desconexión mientras está BUSY', async () => {
    stateQueryBuilder.getOne.mockResolvedValue({
      ...offlineState,
      status: DriverOperationalStatus.BUSY,
    });

    await expect(service.goOffline(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('debe registrar heartbeat cuando está disponible', async () => {
    stateQueryBuilder.getOne.mockResolvedValue({
      ...offlineState,
      status: DriverOperationalStatus.AVAILABLE,
    });

    const result = await service.heartbeat(userId);

    expect(result.lastSeenAt).toBeInstanceOf(Date);

    expect(stateRepository.save).toHaveBeenCalledTimes(1);

    expect(availabilityRedisService.renewPresenceIfExists).toHaveBeenCalledWith(
      profile.id,
    );
  });

  it('debe rechazar heartbeat cuando está OFFLINE', async () => {
    stateQueryBuilder.getOne.mockResolvedValue({
      ...offlineState,
    });

    await expect(service.heartbeat(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
