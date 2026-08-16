import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { REQUIRED_DRIVER_APPLICATION_DOCUMENT_TYPES } from './driver-application.constants';
import { DriverDocument } from './entities/driver-document.entity';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverVehicle } from './entities/driver-vehicle.entity';
import { DriverDocumentStatus } from './enums/driver-document-status.enum';
import { DriverDocumentType } from './enums/driver-document-type.enum';
import { DriverStatus } from './enums/driver-status.enum';
import { VehicleStatus } from './enums/vehicle-status.enum';

@Injectable()
export class DriverApplicationSubmissionService {
  constructor(private readonly dataSource: DataSource) {}

  submit(userId: string): Promise<DriverProfile> {
    return this.dataSource.transaction((manager) =>
      this.submitWithinTransaction(manager, userId),
    );
  }

  private async submitWithinTransaction(
    manager: EntityManager,
    userId: string,
  ): Promise<DriverProfile> {
    const profileRepository = manager.getRepository(DriverProfile);

    const vehicleRepository = manager.getRepository(DriverVehicle);

    const documentRepository = manager.getRepository(DriverDocument);

    /*
     * Bloqueamos primero el perfil para impedir dos
     * envíos simultáneos de la misma solicitud.
     */
    const profile = await profileRepository
      .createQueryBuilder('profile')
      .where('profile.user_id = :userId', {
        userId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!profile) {
      throw new NotFoundException(
        'Primero debes crear tu solicitud de conductor',
      );
    }

    this.assertProfileCanBeSubmitted(profile);

    const vehicle = await vehicleRepository
      .createQueryBuilder('vehicle')
      .where('vehicle.driver_profile_id = :driverProfileId', {
        driverProfileId: profile.id,
      })
      .setLock('pessimistic_write')
      .getOne();

    const documents = await documentRepository
      .createQueryBuilder('document')
      .where('document.driver_profile_id = :driverProfileId', {
        driverProfileId: profile.id,
      })
      .setLock('pessimistic_write')
      .orderBy('document.created_at', 'ASC')
      .getMany();

    const missingRequirements = this.getMissingRequirements(
      profile,
      vehicle,
      documents,
    );

    if (missingRequirements.length > 0) {
      this.throwValidationError(
        'La solicitud está incompleta',
        'missingRequirements',
        missingRequirements,
      );
    }

    /*
     * Después de comprobar los requisitos faltantes,
     * TypeScript puede seguir considerando que vehicle
     * es null. Esta validación garantiza lo contrario.
     */
    if (!vehicle) {
      throw new BadRequestException('El vehículo del conductor no existe');
    }

    const invalidRequirements = this.getInvalidRequirements(vehicle, documents);

    if (invalidRequirements.length > 0) {
      this.throwValidationError(
        'La solicitud contiene requisitos inválidos',
        'invalidRequirements',
        invalidRequirements,
      );
    }

    const submittedAt = new Date();

    profile.status = DriverStatus.PENDING_REVIEW;

    profile.submittedAt = submittedAt;
    profile.rejectionReason = null;
    profile.approvedAt = null;
    profile.approvedByUserId = null;

    vehicle.status = VehicleStatus.PENDING_REVIEW;

    vehicle.rejectionReason = null;

    for (const document of documents) {
      document.status = DriverDocumentStatus.PENDING_REVIEW;

      document.rejectionReason = null;
      document.reviewedAt = null;
      document.reviewedByUserId = null;
    }

    /*
     * Todas estas operaciones utilizan el mismo
     * EntityManager transaccional.
     */
    await vehicleRepository.save(vehicle);
    await documentRepository.save(documents);

    return profileRepository.save(profile);
  }

  private assertProfileCanBeSubmitted(profile: DriverProfile): void {
    const allowedStatuses = [DriverStatus.DRAFT, DriverStatus.REJECTED];

    if (!allowedStatuses.includes(profile.status)) {
      throw new BadRequestException(
        'La solicitud no puede enviarse a revisión en su estado actual',
      );
    }
  }

  private getMissingRequirements(
    profile: DriverProfile,
    vehicle: DriverVehicle | null,
    documents: DriverDocument[],
  ): string[] {
    const missingRequirements: string[] = [];

    /*
     * DRIVER-ONBOARDING-R2: la foto de perfil es obligatoria antes de
     * enviar la solicitud, pero es DriverProfile.photoObjectKey/
     * photoUrl, no un DriverDocument — nunca exigir
     * DriverDocumentType.PROFILE_PHOTO aquí.
     */
    if (!profile.photoObjectKey && !profile.photoUrl) {
      missingRequirements.push('DRIVER_PROFILE_PHOTO');
    }

    if (!vehicle) {
      missingRequirements.push('DRIVER_VEHICLE');
    }

    const registeredDocumentTypes = new Set(
      documents.map((document) => document.type),
    );

    for (const requiredType of REQUIRED_DRIVER_APPLICATION_DOCUMENT_TYPES) {
      if (!registeredDocumentTypes.has(requiredType)) {
        missingRequirements.push(requiredType);
      }
    }

    return missingRequirements;
  }

  private getInvalidRequirements(
    vehicle: DriverVehicle,
    documents: DriverDocument[],
  ): string[] {
    const invalidRequirements: string[] = [];

    const allowedVehicleStatuses = [
      VehicleStatus.DRAFT,
      VehicleStatus.REJECTED,
    ];

    if (!allowedVehicleStatuses.includes(vehicle.status)) {
      invalidRequirements.push(`DRIVER_VEHICLE_STATUS_${vehicle.status}`);
    }

    for (const document of documents) {
      this.validateDocument(document, invalidRequirements);
    }

    return invalidRequirements;
  }

  private validateDocument(
    document: DriverDocument,
    invalidRequirements: string[],
  ): void {
    const allowedDocumentStatuses = [
      DriverDocumentStatus.DRAFT,
      DriverDocumentStatus.REJECTED,
    ];

    if (!allowedDocumentStatuses.includes(document.status)) {
      invalidRequirements.push(`${document.type}_STATUS_${document.status}`);
    }

    /*
     * STORAGE-R2: un documento es válido si tiene la URL legacy
     * (fileUrl) o el objectKey canónico de Railway Storage
     * (fileObjectKey) — nunca ambos ausentes.
     */
    if (!document.fileUrl && !document.fileObjectKey) {
      invalidRequirements.push(`${document.type}_FILE_MISSING`);
    }

    switch (document.type) {
      case DriverDocumentType.DRIVER_LICENSE:
      case DriverDocumentType.SOAT:
        this.validateExpiringDocument(document, invalidRequirements);
        break;

      case DriverDocumentType.VEHICLE_REGISTRATION:
        if (!document.documentNumber || !document.issuedAt) {
          invalidRequirements.push(`${document.type}_INCOMPLETE`);
        }

        if (document.issuedAt && this.isFutureDate(document.issuedAt)) {
          invalidRequirements.push(`${document.type}_ISSUED_AT_FUTURE`);
        }

        break;

      case DriverDocumentType.DNI_FRONT:
      case DriverDocumentType.DNI_BACK:
      case DriverDocumentType.PROFILE_PHOTO:
        break;
    }
  }

  private validateExpiringDocument(
    document: DriverDocument,
    invalidRequirements: string[],
  ): void {
    if (!document.documentNumber || !document.issuedAt || !document.expiresAt) {
      invalidRequirements.push(`${document.type}_INCOMPLETE`);

      return;
    }

    if (this.isFutureDate(document.issuedAt)) {
      invalidRequirements.push(`${document.type}_ISSUED_AT_FUTURE`);
    }

    if (document.expiresAt <= document.issuedAt) {
      invalidRequirements.push(`${document.type}_INVALID_DATE_RANGE`);
    }

    if (this.isExpired(document.expiresAt)) {
      invalidRequirements.push(`${document.type}_EXPIRED`);
    }
  }

  private isExpired(date: string): boolean {
    return date < this.getTodayIsoDate();
  }

  private isFutureDate(date: string): boolean {
    return date > this.getTodayIsoDate();
  }

  private getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private throwValidationError(
    message: string,
    property: 'missingRequirements' | 'invalidRequirements',
    requirements: string[],
  ): never {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      message,
      [property]: requirements,
      error: 'Bad Request',
    });
  }
}
