import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { DriverDocument } from '../drivers/entities/driver-document.entity';
import type { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import type { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import type { StorageObjectHead } from '../../infrastructure/storage/s3-storage.service';
import { StorageCategory } from './enums/storage-category.enum';
import { StorageService } from './storage.service';

const OWNER_USER_ID = 'user-driver-1';
const OTHER_USER_ID = 'user-driver-2';
const DRIVER_PROFILE_ID = 'driver-profile-1';
const PASSENGER_PROFILE_ID = 'passenger-profile-1';

interface S3StorageMock {
  isEnabled: jest.Mock;
  getUploadUrlTtlSeconds: jest.Mock;
  getDownloadUrlTtlSeconds: jest.Mock;
  getMaxImageSizeBytes: jest.Mock;
  getMaxPdfSizeBytes: jest.Mock;
  presignPutUrl: jest.Mock;
  presignGetUrl: jest.Mock;
  headObject: jest.Mock;
  deleteObjectBestEffort: jest.Mock;
}

interface DriversServiceMock {
  assertProfilePhotoUploadAllowed: jest.Mock;
  completeProfilePhotoUpload: jest.Mock;
}

interface PassengersServiceMock {
  assertProfilePhotoUploadAllowed: jest.Mock;
  completeProfilePhotoUpload: jest.Mock;
}

interface DriverDocumentsServiceMock {
  assertDocumentUploadAllowed: jest.Mock;
  completeDocumentUpload: jest.Mock;
  getMyDocumentForDownload: jest.Mock;
}

interface RepositoryMock {
  findOne: jest.Mock;
}

function buildConfigService(): ConfigService {
  const values: Record<string, string> = {
    PUBLIC_API_ORIGIN: 'https://api.tukituki.pe',
    API_PREFIX: 'api/v1',
  };

  return {
    getOrThrow: (key: string): string => values[key],
  } as unknown as ConfigService;
}

describe('StorageService', () => {
  let s3Storage: S3StorageMock;
  let driversService: DriversServiceMock;
  let passengersService: PassengersServiceMock;
  let driverDocumentsService: DriverDocumentsServiceMock;
  let driverProfilesRepository: RepositoryMock;
  let passengerProfilesRepository: RepositoryMock;
  let driverDocumentsRepository: RepositoryMock;
  let service: StorageService;

  const driverProfile = { id: DRIVER_PROFILE_ID } as DriverProfile;
  const passengerProfile = { id: PASSENGER_PROFILE_ID } as PassengerProfile;

  beforeEach(() => {
    s3Storage = {
      isEnabled: jest.fn(() => true),
      getUploadUrlTtlSeconds: jest.fn(() => 300),
      getDownloadUrlTtlSeconds: jest.fn(() => 900),
      getMaxImageSizeBytes: jest.fn(() => 8_388_608),
      getMaxPdfSizeBytes: jest.fn(() => 10_485_760),
      presignPutUrl: jest.fn(() =>
        Promise.resolve('https://signed.example/put'),
      ),
      presignGetUrl: jest.fn(() =>
        Promise.resolve('https://signed.example/get'),
      ),
      headObject: jest.fn(),
      deleteObjectBestEffort: jest.fn(() => Promise.resolve(undefined)),
    };

    driversService = {
      assertProfilePhotoUploadAllowed: jest.fn(() =>
        Promise.resolve(driverProfile),
      ),
      completeProfilePhotoUpload: jest.fn(),
    };

    passengersService = {
      assertProfilePhotoUploadAllowed: jest.fn(() =>
        Promise.resolve(passengerProfile),
      ),
      completeProfilePhotoUpload: jest.fn(),
    };

    driverDocumentsService = {
      assertDocumentUploadAllowed: jest.fn(() =>
        Promise.resolve(driverProfile),
      ),
      completeDocumentUpload: jest.fn(),
      getMyDocumentForDownload: jest.fn(),
    };

    driverProfilesRepository = { findOne: jest.fn() };
    passengerProfilesRepository = { findOne: jest.fn() };
    driverDocumentsRepository = { findOne: jest.fn() };

    service = new StorageService(
      buildConfigService(),
      s3Storage as never,
      driversService as never,
      passengersService as never,
      driverDocumentsService as never,
      driverProfilesRepository as never,
      passengerProfilesRepository as never,
      driverDocumentsRepository as never,
    );
  });

  describe('createPresignedUpload (PRESIGN)', () => {
    it('el pasajero puede presignar su foto de perfil', async () => {
      const result = await service.createPresignedUpload(OWNER_USER_ID, {
        category: StorageCategory.PASSENGER_PROFILE_PHOTO,
        contentType: 'image/jpeg',
        fileSize: 1_000_000,
      });

      expect(
        passengersService.assertProfilePhotoUploadAllowed,
      ).toHaveBeenCalledWith(OWNER_USER_ID);
      expect(
        result.objectKey.startsWith('passengers/user-driver-1/profile/'),
      ).toBe(true);
      expect(result.uploadUrl).toBe('https://signed.example/put');
    });

    it('el pasajero NO puede presignar un documento de conductor (no tiene DriverProfile)', async () => {
      driverDocumentsService.assertDocumentUploadAllowed.mockRejectedValue(
        new NotFoundException('Primero debes crear tu solicitud de conductor'),
      );

      await expect(
        service.createPresignedUpload(OWNER_USER_ID, {
          category: StorageCategory.DRIVER_LICENSE,
          contentType: 'image/jpeg',
          fileSize: 1_000_000,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el conductor puede presignar su propia foto de perfil', async () => {
      const result = await service.createPresignedUpload(OWNER_USER_ID, {
        category: StorageCategory.DRIVER_PROFILE_PHOTO,
        contentType: 'image/png',
        fileSize: 1_000_000,
      });

      expect(
        result.objectKey.startsWith(`drivers/${DRIVER_PROFILE_ID}/profile/`),
      ).toBe(true);
    });

    it('el conductor puede presignar la licencia', async () => {
      const result = await service.createPresignedUpload(OWNER_USER_ID, {
        category: StorageCategory.DRIVER_LICENSE,
        contentType: 'application/pdf',
        fileSize: 1_000_000,
      });

      expect(
        result.objectKey.startsWith(
          `drivers/${DRIVER_PROFILE_ID}/documents/driver-license/`,
        ),
      ).toBe(true);
    });

    it('el conductor puede presignar el SOAT', async () => {
      const result = await service.createPresignedUpload(OWNER_USER_ID, {
        category: StorageCategory.SOAT,
        contentType: 'image/jpeg',
        fileSize: 1_000_000,
      });

      expect(
        result.objectKey.startsWith(
          `drivers/${DRIVER_PROFILE_ID}/documents/soat/`,
        ),
      ).toBe(true);
    });

    it('el conductor puede presignar la tarjeta de propiedad (TIV)', async () => {
      const result = await service.createPresignedUpload(OWNER_USER_ID, {
        category: StorageCategory.VEHICLE_REGISTRATION,
        contentType: 'application/pdf',
        fileSize: 1_000_000,
      });

      expect(
        result.objectKey.startsWith(
          `drivers/${DRIVER_PROFILE_ID}/documents/vehicle-registration/`,
        ),
      ).toBe(true);
    });

    it('rechaza un MIME type no permitido para la categoría', async () => {
      await expect(
        service.createPresignedUpload(OWNER_USER_ID, {
          category: StorageCategory.PASSENGER_PROFILE_PHOTO,
          contentType: 'image/gif',
          fileSize: 1_000_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(s3Storage.presignPutUrl).not.toHaveBeenCalled();
    });

    it('rechaza PDF para una foto de perfil (avatar)', async () => {
      await expect(
        service.createPresignedUpload(OWNER_USER_ID, {
          category: StorageCategory.DRIVER_PROFILE_PHOTO,
          contentType: 'application/pdf',
          fileSize: 1_000_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('permite PDF para los 3 documentos de conductor', async () => {
      await expect(
        service.createPresignedUpload(OWNER_USER_ID, {
          category: StorageCategory.SOAT,
          contentType: 'application/pdf',
          fileSize: 1_000_000,
        }),
      ).resolves.toBeDefined();
    });

    it('rechaza una imagen que supera el tamaño máximo permitido', async () => {
      await expect(
        service.createPresignedUpload(OWNER_USER_ID, {
          category: StorageCategory.PASSENGER_PROFILE_PHOTO,
          contentType: 'image/jpeg',
          fileSize: 8_388_608 + 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un PDF que supera el tamaño máximo permitido', async () => {
      await expect(
        service.createPresignedUpload(OWNER_USER_ID, {
          category: StorageCategory.SOAT,
          contentType: 'application/pdf',
          fileSize: 10_485_760 + 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el objectKey es generado por el Backend, no por el cliente', async () => {
      const result = await service.createPresignedUpload(OWNER_USER_ID, {
        category: StorageCategory.DRIVER_LICENSE,
        contentType: 'image/jpeg',
        fileSize: 1_000_000,
      });

      expect(result.objectKey).toMatch(
        /^drivers\/driver-profile-1\/documents\/driver-license\/[0-9a-f-]{36}\.jpg$/,
      );
    });

    it('la respuesta no contiene credenciales del bucket', async () => {
      const result = await service.createPresignedUpload(OWNER_USER_ID, {
        category: StorageCategory.PASSENGER_PROFILE_PHOTO,
        contentType: 'image/jpeg',
        fileSize: 1_000_000,
      });

      expect(Object.keys(result).sort()).toEqual(
        ['expiresAt', 'objectKey', 'requiredHeaders', 'uploadUrl'].sort(),
      );
      expect(JSON.stringify(result)).not.toMatch(/access|secret/i);
    });

    it('lanza ServiceUnavailableException si el almacenamiento está deshabilitado', async () => {
      s3Storage.isEnabled.mockReturnValue(false);

      await expect(
        service.createPresignedUpload(OWNER_USER_ID, {
          category: StorageCategory.PASSENGER_PROFILE_PHOTO,
          contentType: 'image/jpeg',
          fileSize: 1_000_000,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('completeUpload — OWNERSHIP', () => {
    it('un objectKey que no cae dentro del prefijo del owner se rechaza (Forbidden)', async () => {
      await expect(
        service.completeUpload(OWNER_USER_ID, {
          category: StorageCategory.DRIVER_PROFILE_PHOTO,
          objectKey: 'drivers/OTRO-DRIVER-PROFILE/profile/x.jpg',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(s3Storage.headObject).not.toHaveBeenCalled();
    });

    it('un objectKey de la foto de OTRO pasajero se rechaza (Forbidden)', async () => {
      await expect(
        service.completeUpload(OWNER_USER_ID, {
          category: StorageCategory.PASSENGER_PROFILE_PHOTO,
          objectKey: `passengers/${OTHER_USER_ID}/profile/x.jpg`,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un pasajero sin DriverProfile no puede completar un documento de conductor', async () => {
      driverDocumentsService.assertDocumentUploadAllowed.mockRejectedValue(
        new NotFoundException('Primero debes crear tu solicitud de conductor'),
      );

      await expect(
        service.completeUpload(OWNER_USER_ID, {
          category: StorageCategory.SOAT,
          objectKey: `drivers/${DRIVER_PROFILE_ID}/documents/soat/x.jpg`,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('completeUpload — COMPLETE (HeadObject)', () => {
    const validObjectKey = `drivers/${DRIVER_PROFILE_ID}/profile/9c3f9b3e-1111-4111-8111-111111111111.jpg`;

    it('si el objeto no existe en el bucket (HeadObject null), falla con BadRequest', async () => {
      s3Storage.headObject.mockResolvedValue(null);

      await expect(
        service.completeUpload(OWNER_USER_ID, {
          category: StorageCategory.DRIVER_PROFILE_PHOTO,
          objectKey: validObjectKey,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(driversService.completeProfilePhotoUpload).not.toHaveBeenCalled();
    });

    it('si el ContentType real no coincide con lo permitido, falla con BadRequest', async () => {
      const head: StorageObjectHead = {
        contentType: 'application/zip',
        contentLength: 1000,
      };

      s3Storage.headObject.mockResolvedValue(head);

      await expect(
        service.completeUpload(OWNER_USER_ID, {
          category: StorageCategory.DRIVER_PROFILE_PHOTO,
          objectKey: validObjectKey,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('si el ContentLength real excede el límite, falla con BadRequest', async () => {
      const head: StorageObjectHead = {
        contentType: 'image/jpeg',
        contentLength: 8_388_608 + 1,
      };

      s3Storage.headObject.mockResolvedValue(head);

      await expect(
        service.completeUpload(OWNER_USER_ID, {
          category: StorageCategory.DRIVER_PROFILE_PHOTO,
          objectKey: validObjectKey,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('completeUpload — persistencia por categoría', () => {
    function mockHead(contentType: string, contentLength = 1000): void {
      const head: StorageObjectHead = { contentType, contentLength };

      s3Storage.headObject.mockResolvedValue(head);
    }

    it('completar la foto del PASAJERO actualiza únicamente su propio PassengerProfile', async () => {
      mockHead('image/jpeg');
      passengersService.completeProfilePhotoUpload.mockResolvedValue({
        profile: passengerProfile,
        previousObjectKey: null,
      });

      const objectKey = `passengers/${OWNER_USER_ID}/profile/9c3f9b3e-1111-4111-8111-111111111111.jpg`;

      await service.completeUpload(OWNER_USER_ID, {
        category: StorageCategory.PASSENGER_PROFILE_PHOTO,
        objectKey,
      });

      expect(passengersService.completeProfilePhotoUpload).toHaveBeenCalledWith(
        OWNER_USER_ID,
        objectKey,
        `https://api.tukituki.pe/api/v1/storage/avatars/passenger/${PASSENGER_PROFILE_ID}`,
      );
      expect(driversService.completeProfilePhotoUpload).not.toHaveBeenCalled();
      expect(
        driverDocumentsService.completeDocumentUpload,
      ).not.toHaveBeenCalled();
    });

    it('completar la foto del CONDUCTOR actualiza su DriverProfile y NO crea un DriverDocument PROFILE_PHOTO', async () => {
      mockHead('image/png');
      driversService.completeProfilePhotoUpload.mockResolvedValue({
        profile: driverProfile,
        previousObjectKey: null,
      });

      const objectKey = `drivers/${DRIVER_PROFILE_ID}/profile/9c3f9b3e-1111-4111-8111-111111111111.png`;

      await service.completeUpload(OWNER_USER_ID, {
        category: StorageCategory.DRIVER_PROFILE_PHOTO,
        objectKey,
      });

      expect(driversService.completeProfilePhotoUpload).toHaveBeenCalledWith(
        OWNER_USER_ID,
        objectKey,
        `https://api.tukituki.pe/api/v1/storage/avatars/driver/${DRIVER_PROFILE_ID}`,
      );
      expect(
        driverDocumentsService.completeDocumentUpload,
      ).not.toHaveBeenCalled();
    });

    it('completar DRIVER_LICENSE llama a completeDocumentUpload con el tipo correcto', async () => {
      mockHead('application/pdf');
      driverDocumentsService.completeDocumentUpload.mockResolvedValue({
        document: { id: 'doc-1' } as DriverDocument,
        previousObjectKey: null,
      });

      const objectKey = `drivers/${DRIVER_PROFILE_ID}/documents/driver-license/9c3f9b3e-1111-4111-8111-111111111111.pdf`;

      await service.completeUpload(OWNER_USER_ID, {
        category: StorageCategory.DRIVER_LICENSE,
        objectKey,
      });

      expect(
        driverDocumentsService.completeDocumentUpload,
      ).toHaveBeenCalledWith(
        OWNER_USER_ID,
        DriverDocumentType.DRIVER_LICENSE,
        objectKey,
      );
    });

    it('completar SOAT llama a completeDocumentUpload con el tipo correcto', async () => {
      mockHead('image/jpeg');
      driverDocumentsService.completeDocumentUpload.mockResolvedValue({
        document: { id: 'doc-2' } as DriverDocument,
        previousObjectKey: null,
      });

      const objectKey = `drivers/${DRIVER_PROFILE_ID}/documents/soat/9c3f9b3e-1111-4111-8111-111111111111.jpg`;

      await service.completeUpload(OWNER_USER_ID, {
        category: StorageCategory.SOAT,
        objectKey,
      });

      expect(
        driverDocumentsService.completeDocumentUpload,
      ).toHaveBeenCalledWith(OWNER_USER_ID, DriverDocumentType.SOAT, objectKey);
    });

    it('completar VEHICLE_REGISTRATION llama a completeDocumentUpload con el tipo correcto', async () => {
      mockHead('application/pdf');
      driverDocumentsService.completeDocumentUpload.mockResolvedValue({
        document: { id: 'doc-3' } as DriverDocument,
        previousObjectKey: null,
      });

      const objectKey = `drivers/${DRIVER_PROFILE_ID}/documents/vehicle-registration/9c3f9b3e-1111-4111-8111-111111111111.pdf`;

      await service.completeUpload(OWNER_USER_ID, {
        category: StorageCategory.VEHICLE_REGISTRATION,
        objectKey,
      });

      expect(
        driverDocumentsService.completeDocumentUpload,
      ).toHaveBeenCalledWith(
        OWNER_USER_ID,
        DriverDocumentType.VEHICLE_REGISTRATION,
        objectKey,
      );
    });
  });

  describe('completeUpload — REPLACEMENT (reemplazo seguro)', () => {
    const objectKey = `drivers/${DRIVER_PROFILE_ID}/profile/9c3f9b3e-1111-4111-8111-111111111111.jpg`;

    it('borra el objeto anterior DESPUÉS de confirmar la escritura en DB, nunca antes', async () => {
      const head: StorageObjectHead = {
        contentType: 'image/jpeg',
        contentLength: 1000,
      };

      s3Storage.headObject.mockResolvedValue(head);

      const callOrder: string[] = [];

      driversService.completeProfilePhotoUpload.mockImplementation(() => {
        callOrder.push('persist');

        return Promise.resolve({
          profile: driverProfile,
          previousObjectKey: 'old-object-key.jpg',
        });
      });
      s3Storage.deleteObjectBestEffort.mockImplementation(() => {
        callOrder.push('delete');

        return Promise.resolve(undefined);
      });

      await service.completeUpload(OWNER_USER_ID, {
        category: StorageCategory.DRIVER_PROFILE_PHOTO,
        objectKey,
      });

      expect(callOrder).toEqual(['persist', 'delete']);
      expect(s3Storage.deleteObjectBestEffort).toHaveBeenCalledWith(
        'old-object-key.jpg',
      );
    });

    it('si HeadObject falla, nunca se llega a persistir ni a borrar nada', async () => {
      s3Storage.headObject.mockResolvedValue(null);

      await expect(
        service.completeUpload(OWNER_USER_ID, {
          category: StorageCategory.DRIVER_PROFILE_PHOTO,
          objectKey,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(driversService.completeProfilePhotoUpload).not.toHaveBeenCalled();
      expect(s3Storage.deleteObjectBestEffort).not.toHaveBeenCalled();
    });

    it('si el borrado del objeto anterior falla, la respuesta de éxito no se revierte', async () => {
      const head: StorageObjectHead = {
        contentType: 'image/jpeg',
        contentLength: 1000,
      };

      s3Storage.headObject.mockResolvedValue(head);
      driversService.completeProfilePhotoUpload.mockResolvedValue({
        profile: driverProfile,
        previousObjectKey: 'old-object-key.jpg',
      });
      s3Storage.deleteObjectBestEffort.mockRejectedValue(
        new Error('bucket unreachable'),
      );

      await expect(
        service.completeUpload(OWNER_USER_ID, {
          category: StorageCategory.DRIVER_PROFILE_PHOTO,
          objectKey,
        }),
      ).resolves.toMatchObject({ objectKey });
    });
  });

  describe('getMyDocumentDownloadUrl / getDocumentDownloadUrlForAdmin (READ)', () => {
    it('el propietario obtiene una URL de descarga temporal de su documento', async () => {
      driverDocumentsService.getMyDocumentForDownload.mockResolvedValue({
        fileObjectKey: 'drivers/x/documents/soat/1.jpg',
        fileUrl: null,
      });

      const result = await service.getMyDocumentDownloadUrl(
        OWNER_USER_ID,
        'document-1',
      );

      expect(result.downloadUrl).toBe('https://signed.example/get');
      expect(result.isLegacyUrl).toBe(false);
      expect(result.expiresAt).not.toBeNull();
    });

    it('otro conductor NO puede obtener la URL de un documento ajeno (propagación del NotFound de ownership)', async () => {
      driverDocumentsService.getMyDocumentForDownload.mockRejectedValue(
        new NotFoundException('El documento no existe'),
      );

      await expect(
        service.getMyDocumentDownloadUrl(OTHER_USER_ID, 'document-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ADMIN puede obtener la URL de descarga de cualquier documento por id', async () => {
      driverDocumentsRepository.findOne.mockResolvedValue({
        fileObjectKey: 'drivers/x/documents/driver-license/1.jpg',
        fileUrl: null,
      });

      const result = await service.getDocumentDownloadUrlForAdmin('document-1');

      expect(result.downloadUrl).toBe('https://signed.example/get');
      expect(result.isLegacyUrl).toBe(false);
    });

    it('SUPER_ADMIN usa el mismo camino de servicio que ADMIN (el rol se filtra en el guard del controller)', async () => {
      driverDocumentsRepository.findOne.mockResolvedValue({
        fileObjectKey: 'drivers/x/documents/soat/1.jpg',
        fileUrl: null,
      });

      await expect(
        service.getDocumentDownloadUrlForAdmin('document-1'),
      ).resolves.toBeDefined();
    });

    it('admin: documento inexistente lanza NotFoundException', async () => {
      driverDocumentsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDocumentDownloadUrlForAdmin('missing-document'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('la URL de descarga nunca incluye credenciales del bucket', async () => {
      driverDocumentsRepository.findOne.mockResolvedValue({
        fileObjectKey: 'drivers/x/documents/soat/1.jpg',
        fileUrl: null,
      });

      const result = await service.getDocumentDownloadUrlForAdmin('document-1');

      expect(Object.keys(result).sort()).toEqual(
        ['downloadUrl', 'expiresAt', 'isLegacyUrl'].sort(),
      );
      expect(JSON.stringify(result)).not.toMatch(/access|secret/i);
    });
  });

  describe('LEGACY (documento creado antes de STORAGE-R2)', () => {
    it('un documento con fileUrl legacy y sin fileObjectKey sigue siendo representable', async () => {
      driverDocumentsRepository.findOne.mockResolvedValue({
        fileObjectKey: null,
        fileUrl: 'https://cdn.tukituki.pe/documents/license.jpg',
      });

      const result = await service.getDocumentDownloadUrlForAdmin('legacy-doc');

      expect(result).toEqual({
        downloadUrl: 'https://cdn.tukituki.pe/documents/license.jpg',
        expiresAt: null,
        isLegacyUrl: true,
      });
      expect(s3Storage.presignGetUrl).not.toHaveBeenCalled();
    });

    it('un documento sin fileUrl ni fileObjectKey lanza NotFoundException', async () => {
      driverDocumentsRepository.findOne.mockResolvedValue({
        fileObjectKey: null,
        fileUrl: null,
      });

      await expect(
        service.getDocumentDownloadUrlForAdmin('empty-doc'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('avatares públicos (getDriverAvatarRedirectUrl / getPassengerAvatarRedirectUrl)', () => {
    it('devuelve una presigned GET cuando el conductor tiene foto en Storage', async () => {
      driverProfilesRepository.findOne.mockResolvedValue({
        id: DRIVER_PROFILE_ID,
        photoObjectKey: 'drivers/x/profile/1.jpg',
      });

      const url = await service.getDriverAvatarRedirectUrl(DRIVER_PROFILE_ID);

      expect(url).toBe('https://signed.example/get');
    });

    it('lanza NotFoundException si el conductor no tiene foto en Storage', async () => {
      driverProfilesRepository.findOne.mockResolvedValue({
        id: DRIVER_PROFILE_ID,
        photoObjectKey: null,
      });

      await expect(
        service.getDriverAvatarRedirectUrl(DRIVER_PROFILE_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devuelve una presigned GET cuando el pasajero tiene foto en Storage', async () => {
      passengerProfilesRepository.findOne.mockResolvedValue({
        id: PASSENGER_PROFILE_ID,
        photoObjectKey: 'passengers/x/profile/1.jpg',
      });

      const url =
        await service.getPassengerAvatarRedirectUrl(PASSENGER_PROFILE_ID);

      expect(url).toBe('https://signed.example/get');
    });
  });
});
