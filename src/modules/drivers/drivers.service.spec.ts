import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import type { DeepPartial, FindOneOptions } from 'typeorm';

import { DriversService } from './drivers.service';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverStatus } from './enums/driver-status.enum';
import { IdentityDocumentType } from './enums/identity-document-type.enum';

type RepositoryMock = {
  findOne: jest.Mock<
    Promise<DriverProfile | null>,
    [FindOneOptions<DriverProfile>]
  >;

  create: jest.Mock<DriverProfile, [DeepPartial<DriverProfile>]>;

  save: jest.Mock<Promise<DriverProfile>, [DriverProfile]>;
};

describe('DriversService', () => {
  let service: DriversService;
  let repository: RepositoryMock;

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
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    updatedAt: new Date('2026-07-21T12:00:00.000Z'),
  } as DriverProfile;

  beforeEach(async () => {
    const repositoryMock: RepositoryMock = {
      findOne: jest.fn<
        Promise<DriverProfile | null>,
        [FindOneOptions<DriverProfile>]
      >(),

      create: jest.fn(
        (input: DeepPartial<DriverProfile>): DriverProfile =>
          input as DriverProfile,
      ),

      save: jest.fn((entity: DriverProfile): Promise<DriverProfile> =>
        Promise.resolve(entity),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        {
          provide: getRepositoryToken(DriverProfile),
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<DriversService>(DriversService);

    repository = module.get<RepositoryMock>(getRepositoryToken(DriverProfile));
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe crear una solicitud en borrador', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.createMyProfile(userId, {
      firstName: 'Juan José',
      lastName: 'Torres Solano',
      documentType: IdentityDocumentType.DNI,
      documentNumber: '12345678',
      birthDate: '1995-06-15',
      address: 'Jr. Los Jardines 245, Tarapoto',
    });

    expect(result.status).toBe(DriverStatus.DRAFT);

    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('debe rechazar una segunda solicitud', async () => {
    repository.findOne.mockResolvedValue(profile);

    await expect(
      service.createMyProfile(userId, {
        firstName: 'Juan José',
        lastName: 'Torres Solano',
        documentType: IdentityDocumentType.DNI,
        documentNumber: '12345678',
        birthDate: '1995-06-15',
        address: 'Jr. Los Jardines 245, Tarapoto',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('debe impedir editar una solicitud pendiente', async () => {
    repository.findOne.mockResolvedValue({
      ...profile,
      status: DriverStatus.PENDING_REVIEW,
    });

    await expect(
      service.updateMyProfile(userId, {
        address: 'Nueva dirección',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe devolver una solicitud rechazada a borrador al corregirla', async () => {
    repository.findOne.mockResolvedValue({
      ...profile,
      status: DriverStatus.REJECTED,
      rejectionReason: 'Documento ilegible',
    });

    const result = await service.updateMyProfile(userId, {
      documentNumber: '87654321',
    });

    expect(result.status).toBe(DriverStatus.DRAFT);

    expect(result.rejectionReason).toBeNull();
  });

  describe('STORAGE-R2: assertProfilePhotoUploadAllowed / completeProfilePhotoUpload', () => {
    it('assertProfilePhotoUploadAllowed permite subir foto con perfil en DRAFT', async () => {
      repository.findOne.mockResolvedValue({ ...profile });

      await expect(
        service.assertProfilePhotoUploadAllowed(userId),
      ).resolves.toMatchObject({ id: profile.id });
    });

    it('assertProfilePhotoUploadAllowed rechaza si el perfil está PENDING_REVIEW', async () => {
      repository.findOne.mockResolvedValue({
        ...profile,
        status: DriverStatus.PENDING_REVIEW,
      });

      await expect(
        service.assertProfilePhotoUploadAllowed(userId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('completeProfilePhotoUpload persiste objectKey y la URL resuelta, y devuelve el objectKey anterior', async () => {
      repository.findOne.mockResolvedValue({
        ...profile,
        photoObjectKey: 'drivers/profile/old.jpg',
      });

      const { profile: saved, previousObjectKey } =
        await service.completeProfilePhotoUpload(
          userId,
          'drivers/profile/new.jpg',
          'https://api.tukituki.pe/api/v1/storage/avatars/driver/profile-1',
        );

      expect(saved.photoObjectKey).toBe('drivers/profile/new.jpg');
      expect(saved.photoUrl).toBe(
        'https://api.tukituki.pe/api/v1/storage/avatars/driver/profile-1',
      );
      expect(previousObjectKey).toBe('drivers/profile/old.jpg');
    });

    it('completeProfilePhotoUpload en el primer upload devuelve previousObjectKey null', async () => {
      repository.findOne.mockResolvedValue({
        ...profile,
        photoObjectKey: null,
      });

      const { previousObjectKey } = await service.completeProfilePhotoUpload(
        userId,
        'drivers/profile/first.jpg',
        'https://api.tukituki.pe/api/v1/storage/avatars/driver/profile-1',
      );

      expect(previousObjectKey).toBeNull();
    });
  });
});
