import { randomUUID } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverApplicationSubmissionService } from './driver-application-submission.service';
import { DriverDocument } from './entities/driver-document.entity';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverVehicle } from './entities/driver-vehicle.entity';
import { DriverDocumentStatus } from './enums/driver-document-status.enum';
import { DriverDocumentType } from './enums/driver-document-type.enum';
import { DriverStatus } from './enums/driver-status.enum';
import { IdentityDocumentType } from './enums/identity-document-type.enum';
import { VehicleStatus } from './enums/vehicle-status.enum';
import { VehicleType } from './enums/vehicle-type.enum';

type QueryBuilderMock<T> = {
  where: jest.Mock<QueryBuilderMock<T>, [string, Record<string, unknown>?]>;

  setLock: jest.Mock<QueryBuilderMock<T>, ['pessimistic_write']>;

  orderBy: jest.Mock<QueryBuilderMock<T>, [string, 'ASC' | 'DESC']>;

  getOne: jest.Mock<Promise<T | null>, []>;

  getMany: jest.Mock<Promise<T[]>, []>;
};

function createQueryBuilderMock<T>(): QueryBuilderMock<T> {
  const queryBuilder: QueryBuilderMock<T> = {
    where: jest.fn<QueryBuilderMock<T>, [string, Record<string, unknown>?]>(),

    setLock: jest.fn<QueryBuilderMock<T>, ['pessimistic_write']>(),

    orderBy: jest.fn<QueryBuilderMock<T>, [string, 'ASC' | 'DESC']>(),

    getOne: jest.fn<Promise<T | null>, []>(),

    getMany: jest.fn<Promise<T[]>, []>(),
  };

  queryBuilder.where.mockImplementation(() => queryBuilder);

  queryBuilder.setLock.mockImplementation(() => queryBuilder);

  queryBuilder.orderBy.mockImplementation(() => queryBuilder);

  return queryBuilder;
}

type ProfileRepositoryMock = {
  createQueryBuilder: jest.Mock<QueryBuilderMock<DriverProfile>, [string]>;

  save: jest.Mock<Promise<DriverProfile>, [DriverProfile]>;
};

type VehicleRepositoryMock = {
  createQueryBuilder: jest.Mock<QueryBuilderMock<DriverVehicle>, [string]>;

  save: jest.Mock<Promise<DriverVehicle>, [DriverVehicle]>;
};

type DocumentRepositoryMock = {
  createQueryBuilder: jest.Mock<QueryBuilderMock<DriverDocument>, [string]>;

  save: jest.Mock<Promise<DriverDocument[]>, [DriverDocument[]]>;
};

type TransactionRepositoryMock =
  ProfileRepositoryMock | VehicleRepositoryMock | DocumentRepositoryMock;

describe('DriverApplicationSubmissionService', () => {
  let service: DriverApplicationSubmissionService;

  let profileQueryBuilder: QueryBuilderMock<DriverProfile>;

  let vehicleQueryBuilder: QueryBuilderMock<DriverVehicle>;

  let documentQueryBuilder: QueryBuilderMock<DriverDocument>;

  let profileRepository: ProfileRepositoryMock;

  let vehicleRepository: VehicleRepositoryMock;

  let documentRepository: DocumentRepositoryMock;

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

    status: DriverStatus.DRAFT,

    rejectionReason: null,

    submittedAt: null,

    approvedAt: null,

    approvedByUserId: null,

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

    status: VehicleStatus.DRAFT,

    rejectionReason: null,

    createdAt: new Date(),

    updatedAt: new Date(),
  } as DriverVehicle;

  function createDocument(type: DriverDocumentType): DriverDocument {
    const baseDocument = {
      id: randomUUID(),

      driverProfileId: profile.id,

      type,

      fileUrl: `https://cdn.tukituki.pe/${type}.jpg`,

      documentNumber: null,

      issuedAt: null,

      expiresAt: null,

      status: DriverDocumentStatus.DRAFT,

      rejectionReason: null,

      reviewedAt: null,

      reviewedByUserId: null,

      createdAt: new Date(),

      updatedAt: new Date(),
    } as DriverDocument;

    if (
      type === DriverDocumentType.DRIVER_LICENSE ||
      type === DriverDocumentType.SOAT
    ) {
      baseDocument.documentNumber = `${type}-123`;

      baseDocument.issuedAt = '2026-01-10';

      baseDocument.expiresAt = '2030-01-10';
    }

    if (type === DriverDocumentType.VEHICLE_REGISTRATION) {
      baseDocument.documentNumber = 'TRJ-123456';

      baseDocument.issuedAt = '2025-01-20';
    }

    return baseDocument;
  }

  const completeDocuments = [
    createDocument(DriverDocumentType.DNI_FRONT),

    createDocument(DriverDocumentType.DNI_BACK),

    createDocument(DriverDocumentType.DRIVER_LICENSE),

    createDocument(DriverDocumentType.VEHICLE_REGISTRATION),

    createDocument(DriverDocumentType.SOAT),

    createDocument(DriverDocumentType.PROFILE_PHOTO),
  ];

  beforeEach(async () => {
    profileQueryBuilder = createQueryBuilderMock<DriverProfile>();

    vehicleQueryBuilder = createQueryBuilderMock<DriverVehicle>();

    documentQueryBuilder = createQueryBuilderMock<DriverDocument>();

    profileRepository = {
      createQueryBuilder: jest.fn<QueryBuilderMock<DriverProfile>, [string]>(
        () => profileQueryBuilder,
      ),

      save: jest.fn<Promise<DriverProfile>, [DriverProfile]>(
        (entity: DriverProfile): Promise<DriverProfile> =>
          Promise.resolve(entity),
      ),
    };

    vehicleRepository = {
      createQueryBuilder: jest.fn<QueryBuilderMock<DriverVehicle>, [string]>(
        () => vehicleQueryBuilder,
      ),

      save: jest.fn<Promise<DriverVehicle>, [DriverVehicle]>(
        (entity: DriverVehicle): Promise<DriverVehicle> =>
          Promise.resolve(entity),
      ),
    };

    documentRepository = {
      createQueryBuilder: jest.fn<QueryBuilderMock<DriverDocument>, [string]>(
        () => documentQueryBuilder,
      ),

      save: jest.fn<Promise<DriverDocument[]>, [DriverDocument[]]>(
        (entities: DriverDocument[]): Promise<DriverDocument[]> =>
          Promise.resolve(entities),
      ),
    };

    const getRepositoryMock = jest.fn<TransactionRepositoryMock, [unknown]>(
      (entity: unknown): TransactionRepositoryMock => {
        if (entity === DriverProfile) {
          return profileRepository;
        }

        if (entity === DriverVehicle) {
          return vehicleRepository;
        }

        if (entity === DriverDocument) {
          return documentRepository;
        }

        throw new Error('Repositorio inesperado');
      },
    );

    const managerMock = {
      getRepository: getRepositoryMock,
    } as unknown as EntityManager;

    const dataSourceMock = {
      transaction: jest.fn<
        Promise<DriverProfile>,
        [(manager: EntityManager) => Promise<DriverProfile>]
      >(
        (
          work: (manager: EntityManager) => Promise<DriverProfile>,
        ): Promise<DriverProfile> => work(managerMock),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverApplicationSubmissionService,

        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<DriverApplicationSubmissionService>(
      DriverApplicationSubmissionService,
    );

    profileQueryBuilder.getOne.mockResolvedValue({
      ...profile,
    });

    vehicleQueryBuilder.getOne.mockResolvedValue({
      ...vehicle,
    });

    documentQueryBuilder.getMany.mockResolvedValue(
      completeDocuments.map((document) => ({
        ...document,
      })),
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe enviar una solicitud completa', async () => {
    const result = await service.submit(userId);

    expect(result.status).toBe(DriverStatus.PENDING_REVIEW);

    expect(result.submittedAt).toBeInstanceOf(Date);

    expect(vehicleRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: VehicleStatus.PENDING_REVIEW,
      }),
    );

    const firstDocumentSaveCall = documentRepository.save.mock.calls[0];

    expect(firstDocumentSaveCall).toBeDefined();

    const savedDocuments = firstDocumentSaveCall?.[0] ?? [];

    expect(savedDocuments).toHaveLength(6);

    expect(
      savedDocuments.every(
        (document) => document.status === DriverDocumentStatus.PENDING_REVIEW,
      ),
    ).toBe(true);

    expect(profileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DriverStatus.PENDING_REVIEW,
      }),
    );
  });

  it('debe rechazar si no existe vehículo', async () => {
    vehicleQueryBuilder.getOne.mockResolvedValue(null);

    await expect(service.submit(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(profileRepository.save).not.toHaveBeenCalled();
  });

  it('debe rechazar si falta un documento', async () => {
    documentQueryBuilder.getMany.mockResolvedValue(
      completeDocuments.filter(
        (document) => document.type !== DriverDocumentType.SOAT,
      ),
    );

    await expect(service.submit(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(profileRepository.save).not.toHaveBeenCalled();
  });

  it('debe rechazar un SOAT vencido', async () => {
    documentQueryBuilder.getMany.mockResolvedValue(
      completeDocuments.map((document) =>
        document.type === DriverDocumentType.SOAT
          ? {
              ...document,

              expiresAt: '2020-01-10',
            }
          : {
              ...document,
            },
      ),
    );

    await expect(service.submit(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(profileRepository.save).not.toHaveBeenCalled();
  });

  it('debe rechazar un perfil que ya está pendiente', async () => {
    profileQueryBuilder.getOne.mockResolvedValue({
      ...profile,

      status: DriverStatus.PENDING_REVIEW,
    });

    await expect(service.submit(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(vehicleQueryBuilder.getOne).not.toHaveBeenCalled();

    expect(profileRepository.save).not.toHaveBeenCalled();
  });

  it('debe propagar un error durante el guardado', async () => {
    vehicleRepository.save.mockRejectedValue(
      new Error('Error simulado de PostgreSQL'),
    );

    await expect(service.submit(userId)).rejects.toThrow(
      'Error simulado de PostgreSQL',
    );

    expect(profileRepository.save).not.toHaveBeenCalled();
  });
});
