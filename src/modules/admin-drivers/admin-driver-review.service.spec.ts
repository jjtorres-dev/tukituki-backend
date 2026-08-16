import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { IdentityDocumentType } from '../drivers/enums/identity-document-type.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';
import { VehicleType } from '../drivers/enums/vehicle-type.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { AdminDriverReviewService } from './admin-driver-review.service';

type QueryBuilderMock<T> = {
  where: jest.Mock;
  setLock: jest.Mock;
  orderBy: jest.Mock;
  getOne: jest.Mock<Promise<T | null>, []>;
  getMany: jest.Mock<Promise<T[]>, []>;
};

type EntityRepositoryMock<T> = {
  createQueryBuilder: jest.Mock<QueryBuilderMock<T>, []>;
  save: jest.Mock<Promise<T>, [T]>;
};

type EntityArrayRepositoryMock<T> = {
  createQueryBuilder: jest.Mock<QueryBuilderMock<T>, []>;
  save: jest.Mock<Promise<T[]>, [T[]]>;
};

type OperationalStateRepositoryMock =
  EntityRepositoryMock<DriverOperationalState> & {
    create: jest.Mock<
      DriverOperationalState,
      [Partial<DriverOperationalState>]
    >;
  };

function createQueryBuilderMock<T>(): QueryBuilderMock<T> {
  const queryBuilder = {} as QueryBuilderMock<T>;

  queryBuilder.where = jest.fn(() => queryBuilder);
  queryBuilder.setLock = jest.fn(() => queryBuilder);
  queryBuilder.orderBy = jest.fn(() => queryBuilder);
  queryBuilder.getOne = jest.fn<Promise<T | null>, []>(() =>
    Promise.resolve(null),
  );
  queryBuilder.getMany = jest.fn<Promise<T[]>, []>(() => Promise.resolve([]));

  return queryBuilder;
}

describe('AdminDriverReviewService', () => {
  let service: AdminDriverReviewService;

  let profileQueryBuilder: QueryBuilderMock<DriverProfile>;
  let vehicleQueryBuilder: QueryBuilderMock<DriverVehicle>;
  let documentQueryBuilder: QueryBuilderMock<DriverDocument>;
  let userQueryBuilder: QueryBuilderMock<User>;
  let operationalStateQueryBuilder: QueryBuilderMock<DriverOperationalState>;

  let profileRepository: EntityRepositoryMock<DriverProfile>;
  let vehicleRepository: EntityRepositoryMock<DriverVehicle>;
  let documentRepository: EntityArrayRepositoryMock<DriverDocument>;
  let userRepository: EntityRepositoryMock<User>;
  let operationalStateRepository: OperationalStateRepositoryMock;

  let savedProfile: DriverProfile | undefined;
  let savedVehicle: DriverVehicle | undefined;
  let savedDocuments: DriverDocument[] | undefined;
  let savedUser: User | undefined;
  let savedOperationalState: DriverOperationalState | undefined;

  let availabilityRedisService: {
    removeDriverAvailability: jest.Mock<Promise<void>, [string]>;
  };

  const adminUserId = '97e761e2-ce3d-49cc-b0ed-c0ff3c313444';

  const user: User = {
    id: 'f544d52a-39e0-4da3-8861-6010355c5dba',
    phoneE164: '+51987654321',
    roles: [UserRole.PASSENGER],
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  const profile: DriverProfile = {
    id: '72b81eb5-c53f-4de2-bd9f-11f33d64da64',
    userId: user.id,
    firstName: 'Juan José',
    lastName: 'Torres Solano',
    documentType: IdentityDocumentType.DNI,
    documentNumber: '12345678',
    birthDate: '1995-06-15',
    address: 'Jr. Los Jardines 245, Tarapoto',
    photoUrl: 'https://cdn.tukituki.pe/drivers/photo.jpg',
    photoObjectKey: null,
    status: DriverStatus.PENDING_REVIEW,
    rejectionReason: null,
    submittedAt: new Date(),
    approvedAt: null,
    approvedByUserId: null,
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
    status: VehicleStatus.PENDING_REVIEW,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverVehicle;

  const availableOperationalState: DriverOperationalState = {
    id: 'c63c9943-77e2-49eb-a37a-38af6627bcb9',
    driverProfileId: profile.id,
    status: DriverOperationalStatus.AVAILABLE,
    connectedAt: new Date('2026-07-21T12:00:00.000Z'),
    disconnectedAt: null,
    lastSeenAt: new Date('2026-07-21T12:05:00.000Z'),
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    updatedAt: new Date('2026-07-21T12:05:00.000Z'),
  } as DriverOperationalState;

  function createDocument(type: DriverDocumentType): DriverDocument {
    const document = {
      id: randomUUID(),
      driverProfileId: profile.id,
      type,
      fileUrl: `https://cdn.tukituki.pe/${type}.jpg`,
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

    if (
      type === DriverDocumentType.DRIVER_LICENSE ||
      type === DriverDocumentType.SOAT
    ) {
      document.documentNumber = `${type}-123`;
      document.issuedAt = '2026-01-10';
      document.expiresAt = '2030-01-10';
    }

    if (type === DriverDocumentType.VEHICLE_REGISTRATION) {
      document.documentNumber = 'TRJ-123456';
      document.issuedAt = '2025-01-20';
    }

    return document;
  }

  const completeDocuments: DriverDocument[] = [
    createDocument(DriverDocumentType.DNI_FRONT),
    createDocument(DriverDocumentType.DNI_BACK),
    createDocument(DriverDocumentType.DRIVER_LICENSE),
    createDocument(DriverDocumentType.VEHICLE_REGISTRATION),
    createDocument(DriverDocumentType.SOAT),
    createDocument(DriverDocumentType.PROFILE_PHOTO),
  ];

  beforeEach(async () => {
    savedProfile = undefined;
    savedVehicle = undefined;
    savedDocuments = undefined;
    savedUser = undefined;
    savedOperationalState = undefined;

    availabilityRedisService = {
      removeDriverAvailability: jest.fn<Promise<void>, [string]>(() =>
        Promise.resolve(),
      ),
    };

    profileQueryBuilder = createQueryBuilderMock<DriverProfile>();
    vehicleQueryBuilder = createQueryBuilderMock<DriverVehicle>();
    documentQueryBuilder = createQueryBuilderMock<DriverDocument>();
    userQueryBuilder = createQueryBuilderMock<User>();
    operationalStateQueryBuilder =
      createQueryBuilderMock<DriverOperationalState>();

    profileRepository = {
      createQueryBuilder: jest.fn<QueryBuilderMock<DriverProfile>, []>(
        () => profileQueryBuilder,
      ),
      save: jest.fn<Promise<DriverProfile>, [DriverProfile]>(
        (entity: DriverProfile): Promise<DriverProfile> => {
          savedProfile = entity;
          return Promise.resolve(entity);
        },
      ),
    };

    vehicleRepository = {
      createQueryBuilder: jest.fn<QueryBuilderMock<DriverVehicle>, []>(
        () => vehicleQueryBuilder,
      ),
      save: jest.fn<Promise<DriverVehicle>, [DriverVehicle]>(
        (entity: DriverVehicle): Promise<DriverVehicle> => {
          savedVehicle = entity;
          return Promise.resolve(entity);
        },
      ),
    };

    documentRepository = {
      createQueryBuilder: jest.fn<QueryBuilderMock<DriverDocument>, []>(
        () => documentQueryBuilder,
      ),
      save: jest.fn<Promise<DriverDocument[]>, [DriverDocument[]]>(
        (entities: DriverDocument[]): Promise<DriverDocument[]> => {
          savedDocuments = entities;
          return Promise.resolve(entities);
        },
      ),
    };

    userRepository = {
      createQueryBuilder: jest.fn<QueryBuilderMock<User>, []>(
        () => userQueryBuilder,
      ),
      save: jest.fn<Promise<User>, [User]>((entity: User): Promise<User> => {
        savedUser = entity;
        return Promise.resolve(entity);
      }),
    };

    operationalStateRepository = {
      createQueryBuilder: jest.fn<QueryBuilderMock<DriverOperationalState>, []>(
        () => operationalStateQueryBuilder,
      ),
      create: jest.fn<
        DriverOperationalState,
        [Partial<DriverOperationalState>]
      >(
        (input: Partial<DriverOperationalState>): DriverOperationalState =>
          input as DriverOperationalState,
      ),
      save: jest.fn<Promise<DriverOperationalState>, [DriverOperationalState]>(
        (entity: DriverOperationalState): Promise<DriverOperationalState> => {
          savedOperationalState = entity;
          return Promise.resolve(entity);
        },
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

        if (entity === User) {
          return userRepository;
        }

        if (entity === DriverOperationalState) {
          return operationalStateRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };

    const dataSourceMock = {
      transaction: jest.fn(
        (work: (manager: EntityManager) => Promise<void>): Promise<void> =>
          work(managerMock as unknown as EntityManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDriverReviewService,
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

    service = module.get<AdminDriverReviewService>(AdminDriverReviewService);

    profileQueryBuilder.getOne.mockResolvedValue({
      ...profile,
    });

    vehicleQueryBuilder.getOne.mockResolvedValue({
      ...vehicle,
    });

    documentQueryBuilder.getMany.mockResolvedValue(
      completeDocuments.map((document): DriverDocument => ({
        ...document,
      })),
    );

    userQueryBuilder.getOne.mockResolvedValue({
      ...user,
      roles: [...user.roles],
    });

    operationalStateQueryBuilder.getOne.mockResolvedValue(null);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe aprobar el expediente, agregar DRIVER y dejarlo OFFLINE', async () => {
    await service.approve(profile.id, adminUserId);

    expect(savedProfile).toBeDefined();
    expect(savedUser).toBeDefined();
    expect(savedDocuments).toBeDefined();
    expect(savedOperationalState).toBeDefined();

    expect(savedProfile?.status).toBe(DriverStatus.APPROVED);
    expect(savedProfile?.approvedByUserId).toBe(adminUserId);
    expect(savedProfile?.approvedAt).toBeInstanceOf(Date);
    expect(savedUser?.roles).toContain(UserRole.DRIVER);

    expect(
      savedDocuments?.every(
        (document): boolean =>
          document.status === DriverDocumentStatus.APPROVED,
      ),
    ).toBe(true);

    expect(
      savedDocuments?.every(
        (document): boolean => document.reviewedByUserId === adminUserId,
      ),
    ).toBe(true);

    expect(savedOperationalState?.status).toBe(DriverOperationalStatus.OFFLINE);
    expect(savedOperationalState?.connectedAt).toBeNull();
    expect(savedOperationalState?.disconnectedAt).toBeNull();
    expect(savedOperationalState?.lastSeenAt).toBeNull();

    expect(
      availabilityRedisService.removeDriverAvailability,
    ).toHaveBeenCalledWith(profile.id);
  });

  describe('DRIVER-ONBOARDING-R2: 3 documentos target + foto obligatoria', () => {
    const targetOnlyDocuments: DriverDocument[] = [
      createDocument(DriverDocumentType.DRIVER_LICENSE),
      createDocument(DriverDocumentType.SOAT),
      createDocument(DriverDocumentType.VEHICLE_REGISTRATION),
    ];

    it('aprueba un expediente con solo los 3 documentos target (sin exigir legacy)', async () => {
      documentQueryBuilder.getMany.mockResolvedValue(
        targetOnlyDocuments.map((document): DriverDocument => ({
          ...document,
        })),
      );

      await service.approve(profile.id, adminUserId);

      expect(savedProfile?.status).toBe(DriverStatus.APPROVED);
      expect(savedDocuments).toHaveLength(3);
    });

    it('rechaza aprobar si el perfil no tiene foto (ni photoUrl ni photoObjectKey)', async () => {
      profileQueryBuilder.getOne.mockResolvedValue({
        ...profile,
        photoUrl: null,
        photoObjectKey: null,
      });

      await expect(
        service.approve(profile.id, adminUserId),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(savedProfile).toBeUndefined();
    });
  });

  it('debe impedir aprobar dos veces', async () => {
    profileQueryBuilder.getOne.mockResolvedValue({
      ...profile,
      status: DriverStatus.APPROVED,
    });

    await expect(
      service.approve(profile.id, adminUserId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(savedProfile).toBeUndefined();
    expect(savedOperationalState).toBeUndefined();
  });

  it('debe rechazar un vehículo y un documento', async () => {
    const soat = completeDocuments.find(
      (document): boolean => document.type === DriverDocumentType.SOAT,
    );

    expect(soat).toBeDefined();

    if (!soat) {
      throw new Error('No se encontró el SOAT del fixture');
    }

    await service.reject(profile.id, adminUserId, {
      vehicleReason: 'La placa no coincide',
      documents: [
        {
          documentId: soat.id,
          reason: 'El SOAT no es legible',
        },
      ],
    });

    expect(savedProfile).toBeDefined();
    expect(savedVehicle).toBeDefined();
    expect(savedDocuments).toBeDefined();

    const savedSoat = savedDocuments?.find(
      (document): boolean => document.id === soat.id,
    );

    expect(savedProfile?.status).toBe(DriverStatus.REJECTED);
    expect(savedVehicle?.status).toBe(VehicleStatus.REJECTED);
    expect(savedVehicle?.rejectionReason).toBe('La placa no coincide');
    expect(savedSoat?.status).toBe(DriverDocumentStatus.REJECTED);
    expect(savedSoat?.rejectionReason).toBe('El SOAT no es legible');

    expect(
      savedDocuments
        ?.filter((document): boolean => document.id !== soat.id)
        .every(
          (document): boolean => document.status === DriverDocumentStatus.DRAFT,
        ),
    ).toBe(true);

    expect(savedOperationalState).toBeUndefined();
  });

  it('debe exigir al menos una observación', async () => {
    await expect(
      service.reject(profile.id, adminUserId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(savedProfile).toBeUndefined();
  });

  it('debe rechazar documentos ajenos al expediente', async () => {
    await expect(
      service.reject(profile.id, adminUserId, {
        documents: [
          {
            documentId: randomUUID(),
            reason: 'Documento inválido',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(savedProfile).toBeUndefined();
  });

  it('debe suspender, retirar DRIVER y forzar OFFLINE', async () => {
    profileQueryBuilder.getOne.mockResolvedValue({
      ...profile,
      status: DriverStatus.APPROVED,
    });

    userQueryBuilder.getOne.mockResolvedValue({
      ...user,
      roles: [UserRole.PASSENGER, UserRole.DRIVER],
    });

    operationalStateQueryBuilder.getOne.mockResolvedValue({
      ...availableOperationalState,
    });

    await service.suspend(
      profile.id,
      adminUserId,
      'Incumplimiento de políticas',
    );

    expect(savedProfile).toBeDefined();
    expect(savedVehicle).toBeDefined();
    expect(savedUser).toBeDefined();
    expect(savedOperationalState).toBeDefined();

    expect(savedProfile?.status).toBe(DriverStatus.SUSPENDED);
    expect(savedProfile?.suspensionReason).toBe('Incumplimiento de políticas');
    expect(savedProfile?.suspendedByUserId).toBe(adminUserId);
    expect(savedProfile?.suspendedAt).toBeInstanceOf(Date);
    expect(savedVehicle?.status).toBe(VehicleStatus.SUSPENDED);
    expect(savedUser?.roles).not.toContain(UserRole.DRIVER);
    expect(savedUser?.roles).toContain(UserRole.PASSENGER);
    expect(savedOperationalState?.status).toBe(DriverOperationalStatus.OFFLINE);
    expect(savedOperationalState?.disconnectedAt).toBeInstanceOf(Date);

    expect(
      availabilityRedisService.removeDriverAvailability,
    ).toHaveBeenCalledWith(profile.id);
  });
});
