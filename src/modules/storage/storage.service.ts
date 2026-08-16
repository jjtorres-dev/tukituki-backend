import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverDocumentsService } from '../drivers/driver-documents.service';
import { DriversService } from '../drivers/drivers.service';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { PassengersService } from '../passengers/passengers.service';
import { S3StorageService } from '../../infrastructure/storage/s3-storage.service';
import {
  buildDriverAvatarUrl,
  buildPassengerAvatarUrl,
} from './avatar-url.util';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CompleteUploadResponseDto } from './dto/complete-upload-response.dto';
import { CreatePresignedUploadDto } from './dto/create-presigned-upload.dto';
import { DownloadUrlResponseDto } from './dto/download-url-response.dto';
import { PresignedUploadResponseDto } from './dto/presigned-upload-response.dto';
import { StorageCategory } from './enums/storage-category.enum';
import {
  getAllowedMimeTypes,
  getObjectKind,
  mapStorageCategoryToDriverDocumentType,
} from './storage-category.policy';
import {
  buildObjectKey,
  buildOwnerPrefix,
  isObjectKeyWithinPrefix,
} from './storage-object-key.util';

@Injectable()
export class StorageService {
  constructor(
    private readonly configService: ConfigService,

    private readonly s3Storage: S3StorageService,

    private readonly driversService: DriversService,

    private readonly passengersService: PassengersService,

    private readonly driverDocumentsService: DriverDocumentsService,

    @InjectRepository(DriverProfile)
    private readonly driverProfilesRepository: Repository<DriverProfile>,

    @InjectRepository(PassengerProfile)
    private readonly passengerProfilesRepository: Repository<PassengerProfile>,

    @InjectRepository(DriverDocument)
    private readonly driverDocumentsRepository: Repository<DriverDocument>,
  ) {}

  async createPresignedUpload(
    userId: string,
    dto: CreatePresignedUploadDto,
  ): Promise<PresignedUploadResponseDto> {
    this.assertStorageEnabled();
    this.assertMimeAllowed(dto.category, dto.contentType);
    this.assertSizeAllowed(dto.category, dto.contentType, dto.fileSize);

    const ownerPrefix = await this.resolveOwnerPrefix(userId, dto.category);
    const objectKey = buildObjectKey(ownerPrefix, dto.contentType);
    const uploadUrl = await this.s3Storage.presignPutUrl(
      objectKey,
      dto.contentType,
    );
    const expiresAt = new Date(
      Date.now() + this.s3Storage.getUploadUrlTtlSeconds() * 1000,
    ).toISOString();

    return {
      objectKey,
      uploadUrl,
      expiresAt,
      requiredHeaders: {
        'Content-Type': dto.contentType,
      },
    };
  }

  async completeUpload(
    userId: string,
    dto: CompleteUploadDto,
  ): Promise<CompleteUploadResponseDto> {
    this.assertStorageEnabled();

    const ownerPrefix = await this.resolveOwnerPrefix(userId, dto.category);

    if (!isObjectKeyWithinPrefix(dto.objectKey, ownerPrefix)) {
      throw new ForbiddenException(
        'El objectKey no corresponde a este usuario o categoría',
      );
    }

    const head = await this.s3Storage.headObject(dto.objectKey);

    if (!head) {
      throw new BadRequestException(
        'El archivo no existe en el almacenamiento; verifica que la subida se completó',
      );
    }

    const allowedMimeTypes = getAllowedMimeTypes(dto.category);

    if (!head.contentType || !allowedMimeTypes.includes(head.contentType)) {
      throw new BadRequestException(
        'El tipo de archivo subido no es válido para esta categoría',
      );
    }

    this.assertSizeAllowed(
      dto.category,
      head.contentType,
      head.contentLength ?? 0,
    );

    const previousObjectKey = await this.persistCompletedUpload(
      userId,
      dto.category,
      dto.objectKey,
    );

    /*
     * Fase 20/24: la escritura en DB ya confirmó (previousObjectKey
     * viene de esa escritura exitosa). Un fallo al borrar el objeto
     * anterior nunca debe convertir esta respuesta en un error: la
     * referencia nueva ya es válida y el objeto anterior, en el peor
     * caso, queda huérfano temporalmente en el bucket.
     */
    if (previousObjectKey) {
      try {
        await this.s3Storage.deleteObjectBestEffort(previousObjectKey);
      } catch {
        // best-effort: S3StorageService ya no debería lanzar, pero
        // esta captura es la garantía final de que un fallo aquí no
        // revierte ni falla una escritura en DB ya confirmada.
      }
    }

    return {
      category: dto.category,
      objectKey: dto.objectKey,
      completedAt: new Date().toISOString(),
    };
  }

  async getDriverAvatarRedirectUrl(driverProfileId: string): Promise<string> {
    this.assertStorageEnabled();

    const profile = await this.driverProfilesRepository.findOne({
      select: {
        id: true,
        photoObjectKey: true,
      },
      where: {
        id: driverProfileId,
      },
    });

    if (!profile?.photoObjectKey) {
      throw new NotFoundException('El conductor no tiene una foto disponible');
    }

    return this.s3Storage.presignGetUrl(profile.photoObjectKey);
  }

  async getPassengerAvatarRedirectUrl(
    passengerProfileId: string,
  ): Promise<string> {
    this.assertStorageEnabled();

    const profile = await this.passengerProfilesRepository.findOne({
      select: {
        id: true,
        photoObjectKey: true,
      },
      where: {
        id: passengerProfileId,
      },
    });

    if (!profile?.photoObjectKey) {
      throw new NotFoundException('El pasajero no tiene una foto disponible');
    }

    return this.s3Storage.presignGetUrl(profile.photoObjectKey);
  }

  async getMyDocumentDownloadUrl(
    userId: string,
    documentId: string,
  ): Promise<DownloadUrlResponseDto> {
    const document = await this.driverDocumentsService.getMyDocumentForDownload(
      userId,
      documentId,
    );

    return this.buildDocumentDownloadResponse(document);
  }

  async getDocumentDownloadUrlForAdmin(
    documentId: string,
  ): Promise<DownloadUrlResponseDto> {
    const document = await this.driverDocumentsRepository.findOne({
      where: {
        id: documentId,
      },
    });

    if (!document) {
      throw new NotFoundException('El documento no existe');
    }

    return this.buildDocumentDownloadResponse(document);
  }

  private async buildDocumentDownloadResponse(
    document: DriverDocument,
  ): Promise<DownloadUrlResponseDto> {
    if (document.fileObjectKey) {
      this.assertStorageEnabled();

      const downloadUrl = await this.s3Storage.presignGetUrl(
        document.fileObjectKey,
      );
      const expiresAt = new Date(
        Date.now() + this.s3Storage.getDownloadUrlTtlSeconds() * 1000,
      ).toISOString();

      return { downloadUrl, expiresAt, isLegacyUrl: false };
    }

    if (document.fileUrl) {
      /*
       * Compatibilidad legacy (Fase 21): el documento todavía no fue
       * migrado a Storage. Se devuelve la URL legacy tal cual, sin
       * expiración administrada por este Backend.
       */
      return {
        downloadUrl: document.fileUrl,
        expiresAt: null,
        isLegacyUrl: true,
      };
    }

    throw new NotFoundException('El documento todavía no tiene un archivo');
  }

  private async persistCompletedUpload(
    userId: string,
    category: StorageCategory,
    objectKey: string,
  ): Promise<string | null> {
    switch (category) {
      case StorageCategory.PASSENGER_PROFILE_PHOTO: {
        const preview =
          await this.passengersService.assertProfilePhotoUploadAllowed(userId);
        const avatarUrl = this.buildPassengerAvatarUrl(preview.id);
        const { previousObjectKey } =
          await this.passengersService.completeProfilePhotoUpload(
            userId,
            objectKey,
            avatarUrl,
          );

        return previousObjectKey;
      }

      case StorageCategory.DRIVER_PROFILE_PHOTO: {
        const preview =
          await this.driversService.assertProfilePhotoUploadAllowed(userId);
        const avatarUrl = this.buildDriverAvatarUrl(preview.id);
        const { previousObjectKey } =
          await this.driversService.completeProfilePhotoUpload(
            userId,
            objectKey,
            avatarUrl,
          );

        return previousObjectKey;
      }

      case StorageCategory.DRIVER_LICENSE:
      case StorageCategory.SOAT:
      case StorageCategory.VEHICLE_REGISTRATION: {
        const documentType = mapStorageCategoryToDriverDocumentType(category);

        if (!documentType) {
          throw new BadRequestException('La categoría no es válida');
        }

        const { previousObjectKey } =
          await this.driverDocumentsService.completeDocumentUpload(
            userId,
            documentType,
            objectKey,
          );

        return previousObjectKey;
      }
    }
  }

  private async resolveOwnerPrefix(
    userId: string,
    category: StorageCategory,
  ): Promise<string> {
    switch (category) {
      case StorageCategory.PASSENGER_PROFILE_PHOTO: {
        await this.passengersService.assertProfilePhotoUploadAllowed(userId);

        return buildOwnerPrefix(category, { userId });
      }

      case StorageCategory.DRIVER_PROFILE_PHOTO: {
        const profile =
          await this.driversService.assertProfilePhotoUploadAllowed(userId);

        return buildOwnerPrefix(category, { driverProfileId: profile.id });
      }

      case StorageCategory.DRIVER_LICENSE:
      case StorageCategory.SOAT:
      case StorageCategory.VEHICLE_REGISTRATION: {
        const profile =
          await this.driverDocumentsService.assertDocumentUploadAllowed(userId);

        return buildOwnerPrefix(category, { driverProfileId: profile.id });
      }
    }
  }

  private buildDriverAvatarUrl(driverProfileId: string): string {
    return buildDriverAvatarUrl(
      this.configService.getOrThrow<string>('PUBLIC_API_ORIGIN'),
      this.configService.getOrThrow<string>('API_PREFIX'),
      driverProfileId,
    );
  }

  private buildPassengerAvatarUrl(passengerProfileId: string): string {
    return buildPassengerAvatarUrl(
      this.configService.getOrThrow<string>('PUBLIC_API_ORIGIN'),
      this.configService.getOrThrow<string>('API_PREFIX'),
      passengerProfileId,
    );
  }

  private assertStorageEnabled(): void {
    if (!this.s3Storage.isEnabled()) {
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos todavía no está habilitado en este ambiente',
      );
    }
  }

  private assertMimeAllowed(
    category: StorageCategory,
    contentType: string,
  ): void {
    if (!getAllowedMimeTypes(category).includes(contentType)) {
      throw new BadRequestException(
        `El tipo de archivo ${contentType} no está permitido para esta categoría`,
      );
    }
  }

  private assertSizeAllowed(
    category: StorageCategory,
    contentType: string,
    fileSize: number,
  ): void {
    const kind = getObjectKind(contentType);
    const maxSize =
      kind === 'pdf'
        ? this.s3Storage.getMaxPdfSizeBytes()
        : this.s3Storage.getMaxImageSizeBytes();

    if (fileSize > maxSize) {
      throw new BadRequestException(
        `El archivo supera el tamaño máximo permitido (${maxSize} bytes)`,
      );
    }
  }
}
