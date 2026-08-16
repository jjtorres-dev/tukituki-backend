import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import type { DeepPartial, FindManyOptions, FindOneOptions } from 'typeorm';

import { DriverDocumentsService } from './driver-documents.service';
import { DriverDocument } from './entities/driver-document.entity';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverVehicle } from './entities/driver-vehicle.entity';
import { DriverDocumentStatus } from './enums/driver-document-status.enum';
import { DriverDocumentType } from './enums/driver-document-type.enum';
import { DriverStatus } from './enums/driver-status.enum';
import { IdentityDocumentType } from './enums/identity-document-type.enum';
import { VehicleStatus } from './enums/vehicle-status.enum';
import { VehicleType } from './enums/vehicle-type.enum';

type DriverProfileRepositoryMock = {
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
  findOne: jest.Mock<
    Promise<DriverDocument | null>,
    [FindOneOptions<DriverDocument>]
  >;

  find: jest.Mock<Promise<DriverDocument[]>, [FindManyOptions<DriverDocument>]>;

  create: jest.Mock<DriverDocument, [DeepPartial<DriverDocument>]>;

  save: jest.Mock<Promise<DriverDocument>, [DriverDocument]>;

  remove: jest.Mock<Promise<DriverDocument>, [DriverDocument]>;
};

describe('DriverDocumentsService', () => {
  let service: DriverDocumentsService;

  let profileRepository: DriverProfileRepositoryMock;

  let vehicleRepository: DriverVehicleRepositoryMock;

  let documentRepository: DriverDocumentRepositoryMock;

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
    year: 2024,
    color: 'Azul',
    engineNumber: 'ENG123456789',
    chassisNumber: 'CHS123456789',
    vehicleType: VehicleType.MOTOTAXI,
    status: VehicleStatus.DRAFT,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverVehicle;

  const document: DriverDocument = {
    id: '4a54fd37-89b6-43c8-bde3-4af9847cc8d0',
    driverProfileId: profile.id,
    type: DriverDocumentType.DRIVER_LICENSE,
    fileUrl: 'https://cdn.tukituki.pe/license.jpg',
    documentNumber: 'Q12345678',
    issuedAt: '2024-05-10',
    expiresAt: '2029-05-10',
    status: DriverDocumentStatus.DRAFT,
    rejectionReason: null,
    reviewedAt: null,
    reviewedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DriverDocument;

  beforeEach(async () => {
    const profileRepositoryMock: DriverProfileRepositoryMock = {
      findOne: jest.fn<
        Promise<DriverProfile | null>,
        [FindOneOptions<DriverProfile>]
      >(),
    };

    const vehicleRepositoryMock: DriverVehicleRepositoryMock = {
      findOne: jest.fn<
        Promise<DriverVehicle | null>,
        [FindOneOptions<DriverVehicle>]
      >(),
    };

    const documentRepositoryMock: DriverDocumentRepositoryMock = {
      findOne: jest.fn<
        Promise<DriverDocument | null>,
        [FindOneOptions<DriverDocument>]
      >(),

      find: jest.fn<
        Promise<DriverDocument[]>,
        [FindManyOptions<DriverDocument>]
      >(),

      create: jest.fn(
        (input: DeepPartial<DriverDocument>): DriverDocument =>
          input as DriverDocument,
      ),

      save: jest.fn((entity: DriverDocument): Promise<DriverDocument> =>
        Promise.resolve(entity),
      ),

      remove: jest.fn((entity: DriverDocument): Promise<DriverDocument> =>
        Promise.resolve(entity),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverDocumentsService,
        {
          provide: getRepositoryToken(DriverProfile),
          useValue: profileRepositoryMock,
        },
        {
          provide: getRepositoryToken(DriverVehicle),
          useValue: vehicleRepositoryMock,
        },
        {
          provide: getRepositoryToken(DriverDocument),
          useValue: documentRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<DriverDocumentsService>(DriverDocumentsService);

    profileRepository = module.get<DriverProfileRepositoryMock>(
      getRepositoryToken(DriverProfile),
    );

    vehicleRepository = module.get<DriverVehicleRepositoryMock>(
      getRepositoryToken(DriverVehicle),
    );

    documentRepository = module.get<DriverDocumentRepositoryMock>(
      getRepositoryToken(DriverDocument),
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe registrar una licencia en borrador', async () => {
    profileRepository.findOne.mockResolvedValue({
      ...profile,
    });

    vehicleRepository.findOne.mockResolvedValue({
      ...vehicle,
    });

    documentRepository.findOne.mockResolvedValue(null);

    const result = await service.createMyDocument(userId, {
      type: DriverDocumentType.DRIVER_LICENSE,
      fileUrl: 'https://cdn.tukituki.pe/license.jpg',
      documentNumber: 'Q12345678',
      issuedAt: '2024-05-10',
      expiresAt: '2029-05-10',
    });

    expect(result.status).toBe(DriverDocumentStatus.DRAFT);

    expect(documentRepository.save).toHaveBeenCalledTimes(1);
  });

  it('debe rechazar un tipo duplicado', async () => {
    profileRepository.findOne.mockResolvedValue({
      ...profile,
    });

    vehicleRepository.findOne.mockResolvedValue({
      ...vehicle,
    });

    documentRepository.findOne.mockResolvedValue({
      ...document,
    });

    await expect(
      service.createMyDocument(userId, {
        type: DriverDocumentType.DRIVER_LICENSE,
        fileUrl: 'https://cdn.tukituki.pe/other.jpg',
        documentNumber: 'Q98765432',
        issuedAt: '2025-01-01',
        expiresAt: '2030-01-01',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('debe exigir un vehículo registrado', async () => {
    profileRepository.findOne.mockResolvedValue({
      ...profile,
    });

    vehicleRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createMyDocument(userId, {
        type: DriverDocumentType.DNI_FRONT,
        fileUrl: 'https://cdn.tukituki.pe/dni-front.jpg',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe rechazar vencimiento anterior a emisión', async () => {
    profileRepository.findOne.mockResolvedValue({
      ...profile,
    });

    vehicleRepository.findOne.mockResolvedValue({
      ...vehicle,
    });

    documentRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createMyDocument(userId, {
        type: DriverDocumentType.SOAT,
        fileUrl: 'https://cdn.tukituki.pe/soat.jpg',
        documentNumber: 'SOAT123',
        issuedAt: '2028-01-01',
        expiresAt: '2027-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe actualizar un documento rechazado y devolverlo a borrador', async () => {
    profileRepository.findOne.mockResolvedValue({
      ...profile,
      status: DriverStatus.REJECTED,
    });

    documentRepository.findOne.mockResolvedValue({
      ...document,
      status: DriverDocumentStatus.REJECTED,
      rejectionReason: 'Imagen ilegible',
      reviewedAt: new Date(),
      reviewedByUserId: 'd4108995-ad6e-44ae-b63e-f59bfeefa03e',
    });

    const result = await service.updateMyDocument(userId, document.id, {
      fileUrl: 'https://cdn.tukituki.pe/license-new.jpg',
    });

    expect(result.status).toBe(DriverDocumentStatus.DRAFT);

    expect(result.rejectionReason).toBeNull();

    expect(result.reviewedAt).toBeNull();
    expect(result.reviewedByUserId).toBeNull();
  });

  it('debe impedir modificar un documento pendiente', async () => {
    profileRepository.findOne.mockResolvedValue({
      ...profile,
    });

    documentRepository.findOne.mockResolvedValue({
      ...document,
      status: DriverDocumentStatus.PENDING_REVIEW,
    });

    await expect(
      service.updateMyDocument(userId, document.id, {
        fileUrl: 'https://cdn.tukituki.pe/new.jpg',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe responder 404 cuando el documento no pertenece al conductor', async () => {
    profileRepository.findOne.mockResolvedValue({
      ...profile,
    });

    documentRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getMyDocument(userId, document.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('debe eliminar un documento en borrador', async () => {
    profileRepository.findOne.mockResolvedValue({
      ...profile,
    });

    documentRepository.findOne.mockResolvedValue({
      ...document,
    });

    await service.deleteMyDocument(userId, document.id);

    expect(documentRepository.remove).toHaveBeenCalledTimes(1);
  });

  describe('STORAGE-R2: assertDocumentUploadAllowed / completeDocumentUpload', () => {
    it('assertDocumentUploadAllowed exige perfil editable y vehículo registrado', async () => {
      profileRepository.findOne.mockResolvedValue({ ...profile });
      vehicleRepository.findOne.mockResolvedValue({ ...vehicle });

      await expect(
        service.assertDocumentUploadAllowed(userId),
      ).resolves.toMatchObject({ id: profile.id });
    });

    it('assertDocumentUploadAllowed rechaza si todavía no hay vehículo', async () => {
      profileRepository.findOne.mockResolvedValue({ ...profile });
      vehicleRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assertDocumentUploadAllowed(userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('completeDocumentUpload crea el documento en DRAFT cuando no existe todavía', async () => {
      profileRepository.findOne.mockResolvedValue({ ...profile });
      vehicleRepository.findOne.mockResolvedValue({ ...vehicle });
      documentRepository.findOne.mockResolvedValue(null);

      const { document: created, previousObjectKey } =
        await service.completeDocumentUpload(
          userId,
          DriverDocumentType.SOAT,
          'drivers/profile-1/documents/soat/new-object-key.jpg',
        );

      expect(created.status).toBe(DriverDocumentStatus.DRAFT);
      expect(created.fileObjectKey).toBe(
        'drivers/profile-1/documents/soat/new-object-key.jpg',
      );
      expect(created.fileUrl).toBeNull();
      expect(previousObjectKey).toBeNull();
    });

    it('completeDocumentUpload reemplaza el objectKey de un documento existente y devuelve el anterior', async () => {
      profileRepository.findOne.mockResolvedValue({ ...profile });
      vehicleRepository.findOne.mockResolvedValue({ ...vehicle });
      documentRepository.findOne.mockResolvedValue({
        ...document,
        fileObjectKey: 'drivers/profile-1/documents/driver-license/old.jpg',
      });

      const { document: updated, previousObjectKey } =
        await service.completeDocumentUpload(
          userId,
          DriverDocumentType.DRIVER_LICENSE,
          'drivers/profile-1/documents/driver-license/new.jpg',
        );

      expect(updated.fileObjectKey).toBe(
        'drivers/profile-1/documents/driver-license/new.jpg',
      );
      expect(previousObjectKey).toBe(
        'drivers/profile-1/documents/driver-license/old.jpg',
      );
    });

    it('completeDocumentUpload reactiva a DRAFT un documento previamente RECHAZADO', async () => {
      profileRepository.findOne.mockResolvedValue({ ...profile });
      vehicleRepository.findOne.mockResolvedValue({ ...vehicle });
      documentRepository.findOne.mockResolvedValue({
        ...document,
        status: DriverDocumentStatus.REJECTED,
        rejectionReason: 'Ilegible',
      });

      const { document: updated } = await service.completeDocumentUpload(
        userId,
        DriverDocumentType.DRIVER_LICENSE,
        'drivers/profile-1/documents/driver-license/new.jpg',
      );

      expect(updated.status).toBe(DriverDocumentStatus.DRAFT);
      expect(updated.rejectionReason).toBeNull();
    });

    it('completeDocumentUpload rechaza reemplazar un documento ya PENDING_REVIEW', async () => {
      profileRepository.findOne.mockResolvedValue({ ...profile });
      vehicleRepository.findOne.mockResolvedValue({ ...vehicle });
      documentRepository.findOne.mockResolvedValue({
        ...document,
        status: DriverDocumentStatus.PENDING_REVIEW,
      });

      await expect(
        service.completeDocumentUpload(
          userId,
          DriverDocumentType.DRIVER_LICENSE,
          'drivers/profile-1/documents/driver-license/new.jpg',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('STORAGE-R2: getMyDocumentForDownload', () => {
    it('devuelve el documento cuando pertenece al conductor autenticado', async () => {
      profileRepository.findOne.mockResolvedValue({ ...profile });
      documentRepository.findOne.mockResolvedValue({ ...document });

      await expect(
        service.getMyDocumentForDownload(userId, document.id),
      ).resolves.toMatchObject({ id: document.id });
    });

    it('lanza NotFoundException si el documento no pertenece al conductor', async () => {
      profileRepository.findOne.mockResolvedValue({ ...profile });
      documentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getMyDocumentForDownload(userId, 'otro-documento'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
