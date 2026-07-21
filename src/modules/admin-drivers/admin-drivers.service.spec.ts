import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import type { FindManyOptions, FindOneOptions } from 'typeorm';

import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { IdentityDocumentType } from '../drivers/enums/identity-document-type.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';
import { VehicleType } from '../drivers/enums/vehicle-type.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { AdminDriversService } from './admin-drivers.service';

type QueryBuilderMock = {
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  select: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  clone: jest.Mock;
  getCount: jest.Mock<Promise<number>, []>;
  getRawMany: jest.Mock<Promise<unknown[]>, []>;
};

type DriverProfileRepositoryMock = {
  createQueryBuilder: jest.Mock;
  findOne: jest.Mock<
    Promise<DriverProfile | null>,
    [FindOneOptions<DriverProfile>]
  >;
};

type DriverVehicleRepositoryMock = {
  findOne: jest.Mock<
    Promise<DriverVehicle | null>,
    [FindOneOptions<DriverVehicle>]
  >;
};

type DriverDocumentRepositoryMock = {
  find: jest.Mock<Promise<DriverDocument[]>, [FindManyOptions<DriverDocument>]>;
};

function createQueryBuilderMock(): QueryBuilderMock {
  const queryBuilder = {} as QueryBuilderMock;

  queryBuilder.innerJoin = jest.fn(() => queryBuilder);

  queryBuilder.leftJoin = jest.fn(() => queryBuilder);

  queryBuilder.select = jest.fn(() => queryBuilder);

  queryBuilder.andWhere = jest.fn(() => queryBuilder);

  queryBuilder.orderBy = jest.fn(() => queryBuilder);

  queryBuilder.addOrderBy = jest.fn(() => queryBuilder);

  queryBuilder.skip = jest.fn(() => queryBuilder);

  queryBuilder.take = jest.fn(() => queryBuilder);

  queryBuilder.clone = jest.fn(() => queryBuilder);

  queryBuilder.getCount = jest.fn<Promise<number>, []>();

  queryBuilder.getRawMany = jest.fn<Promise<unknown[]>, []>();

  return queryBuilder;
}

describe('AdminDriversService', () => {
  let service: AdminDriversService;

  let queryBuilder: QueryBuilderMock;

  let profilesRepository: DriverProfileRepositoryMock;

  let vehiclesRepository: DriverVehicleRepositoryMock;

  let documentsRepository: DriverDocumentRepositoryMock;

  const user = {
    id: 'f544d52a-39e0-4da3-8861-6010355c5dba',
    phoneE164: '+51987654321',
    roles: [UserRole.PASSENGER],
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
  };

  const profile = {
    id: '72b81eb5-c53f-4de2-bd9f-11f33d64da64',
    userId: user.id,
    user,
    firstName: 'Juan José',
    lastName: 'Torres Solano',
    documentType: IdentityDocumentType.DNI,
    documentNumber: '12345678',
    birthDate: '1995-06-15',
    address: 'Jr. Los Jardines 245, Tarapoto',
    photoUrl: null,
    status: DriverStatus.PENDING_REVIEW,
    rejectionReason: null,
    submittedAt: new Date('2026-07-21T15:00:00.000Z'),
    approvedAt: null,
    approvedByUserId: null,
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    updatedAt: new Date('2026-07-21T15:00:00.000Z'),
  } as DriverProfile;

  const vehicle = {
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
    status: VehicleStatus.PENDING_REVIEW,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverVehicle;

  const document = {
    id: '4a54fd37-89b6-43c8-bde3-4af9847cc8d0',
    driverProfileId: profile.id,
    type: DriverDocumentType.DNI_FRONT,
    fileUrl: 'https://cdn.tukituki.pe/dni-front.jpg',
    documentNumber: null,
    issuedAt: null,
    expiresAt: null,
    status: DriverDocumentStatus.PENDING_REVIEW,
    rejectionReason: null,
    reviewedAt: null,
    reviewedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverDocument;

  beforeEach(async () => {
    queryBuilder = createQueryBuilderMock();

    const profilesRepositoryMock: DriverProfileRepositoryMock = {
      createQueryBuilder: jest.fn(() => queryBuilder),

      findOne: jest.fn<
        Promise<DriverProfile | null>,
        [FindOneOptions<DriverProfile>]
      >(),
    };

    const vehiclesRepositoryMock: DriverVehicleRepositoryMock = {
      findOne: jest.fn<
        Promise<DriverVehicle | null>,
        [FindOneOptions<DriverVehicle>]
      >(),
    };

    const documentsRepositoryMock: DriverDocumentRepositoryMock = {
      find: jest.fn<
        Promise<DriverDocument[]>,
        [FindManyOptions<DriverDocument>]
      >(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDriversService,
        {
          provide: getRepositoryToken(DriverProfile),
          useValue: profilesRepositoryMock,
        },
        {
          provide: getRepositoryToken(DriverVehicle),
          useValue: vehiclesRepositoryMock,
        },
        {
          provide: getRepositoryToken(DriverDocument),
          useValue: documentsRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<AdminDriversService>(AdminDriversService);

    profilesRepository = module.get<DriverProfileRepositoryMock>(
      getRepositoryToken(DriverProfile),
    );

    vehiclesRepository = module.get<DriverVehicleRepositoryMock>(
      getRepositoryToken(DriverVehicle),
    );

    documentsRepository = module.get<DriverDocumentRepositoryMock>(
      getRepositoryToken(DriverDocument),
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe listar solicitudes paginadas', async () => {
    queryBuilder.getCount.mockResolvedValue(1);

    queryBuilder.getRawMany.mockResolvedValue([
      {
        id: profile.id,
        userId: user.id,
        phoneE164: user.phoneE164,
        firstName: profile.firstName,
        lastName: profile.lastName,
        documentNumber: profile.documentNumber,
        status: DriverStatus.PENDING_REVIEW,
        submittedAt: profile.submittedAt,
        vehiclePlate: vehicle.plate,
        vehicleBrand: vehicle.brand,
        vehicleModel: vehicle.model,
      },
    ]);

    const result = await service.list({
      status: DriverStatus.PENDING_REVIEW,
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.items).toHaveLength(1);

    expect(result.items[0]?.vehicle?.plate).toBe('1234-AB');
  });

  it('debe devolver el expediente completo', async () => {
    profilesRepository.findOne.mockResolvedValue({
      ...profile,
    });

    vehiclesRepository.findOne.mockResolvedValue({
      ...vehicle,
    });

    documentsRepository.find.mockResolvedValue([
      {
        ...document,
      },
    ]);

    const result = await service.getDetail(profile.id);

    expect(result.user.phoneE164).toBe('+51987654321');

    expect(result.profile.status).toBe(DriverStatus.PENDING_REVIEW);

    expect(result.vehicle?.plate).toBe('1234-AB');

    expect(result.documents).toHaveLength(1);
  });

  it('debe responder 404 si la solicitud no existe', async () => {
    profilesRepository.findOne.mockResolvedValue(null);

    await expect(service.getDetail(profile.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
