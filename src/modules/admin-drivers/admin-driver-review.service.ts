import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { RejectDriverApplicationDto } from './dto/reject-driver-application.dto';

const REQUIRED_DOCUMENT_TYPES: readonly DriverDocumentType[] = [
  DriverDocumentType.DNI_FRONT,
  DriverDocumentType.DNI_BACK,
  DriverDocumentType.DRIVER_LICENSE,
  DriverDocumentType.VEHICLE_REGISTRATION,
  DriverDocumentType.SOAT,
  DriverDocumentType.PROFILE_PHOTO,
];

@Injectable()
export class AdminDriverReviewService {
  constructor(private readonly dataSource: DataSource) {}

  approve(driverProfileId: string, adminUserId: string): Promise<void> {
    return this.dataSource.transaction((manager) =>
      this.approveWithinTransaction(manager, driverProfileId, adminUserId),
    );
  }

  reject(
    driverProfileId: string,
    adminUserId: string,
    dto: RejectDriverApplicationDto,
  ): Promise<void> {
    return this.dataSource.transaction((manager) =>
      this.rejectWithinTransaction(manager, driverProfileId, adminUserId, dto),
    );
  }

  suspend(
    driverProfileId: string,
    adminUserId: string,
    reason: string,
  ): Promise<void> {
    return this.dataSource.transaction((manager) =>
      this.suspendWithinTransaction(
        manager,
        driverProfileId,
        adminUserId,
        reason,
      ),
    );
  }

  private async approveWithinTransaction(
    manager: EntityManager,
    driverProfileId: string,
    adminUserId: string,
  ): Promise<void> {
    const profileRepository = manager.getRepository(DriverProfile);
    const vehicleRepository = manager.getRepository(DriverVehicle);
    const documentRepository = manager.getRepository(DriverDocument);
    const userRepository = manager.getRepository(User);
    const operationalStateRepository = manager.getRepository(
      DriverOperationalState,
    );

    const profile = await this.lockProfile(profileRepository, driverProfileId);

    this.assertPendingReview(profile);

    const vehicle = await this.lockVehicle(vehicleRepository, profile.id);

    if (!vehicle) {
      throw new BadRequestException(
        'El expediente no tiene un vehículo registrado',
      );
    }

    const documents = await this.lockDocuments(documentRepository, profile.id);
    const user = await this.lockUser(userRepository, profile.userId);

    this.assertUserCanBecomeDriver(user);
    this.assertApprovalRequirements(vehicle, documents);

    const operationalState = await this.getOrCreateOperationalState(
      operationalStateRepository,
      profile.id,
    );

    const reviewedAt = new Date();

    profile.status = DriverStatus.APPROVED;
    profile.rejectionReason = null;
    profile.approvedAt = reviewedAt;
    profile.approvedByUserId = adminUserId;
    profile.suspensionReason = null;
    profile.suspendedAt = null;
    profile.suspendedByUserId = null;

    vehicle.status = VehicleStatus.APPROVED;
    vehicle.rejectionReason = null;

    for (const document of documents) {
      document.status = DriverDocumentStatus.APPROVED;
      document.rejectionReason = null;
      document.reviewedAt = reviewedAt;
      document.reviewedByUserId = adminUserId;
    }

    user.roles = Array.from(new Set([...user.roles, UserRole.DRIVER]));

    operationalState.status = DriverOperationalStatus.OFFLINE;
    operationalState.connectedAt = null;
    operationalState.disconnectedAt = null;
    operationalState.lastSeenAt = null;

    await userRepository.save(user);
    await vehicleRepository.save(vehicle);
    await documentRepository.save(documents);
    await operationalStateRepository.save(operationalState);
    await profileRepository.save(profile);
  }

  private async rejectWithinTransaction(
    manager: EntityManager,
    driverProfileId: string,
    adminUserId: string,
    dto: RejectDriverApplicationDto,
  ): Promise<void> {
    this.assertRejectionHasObservations(dto);

    const profileRepository = manager.getRepository(DriverProfile);
    const vehicleRepository = manager.getRepository(DriverVehicle);
    const documentRepository = manager.getRepository(DriverDocument);

    const profile = await this.lockProfile(profileRepository, driverProfileId);

    this.assertPendingReview(profile);

    const vehicle = await this.lockVehicle(vehicleRepository, profile.id);

    if (!vehicle) {
      throw new BadRequestException(
        'El expediente no tiene un vehículo registrado',
      );
    }

    const documents = await this.lockDocuments(documentRepository, profile.id);
    const documentReasons = this.createDocumentReasonMap(documents, dto);
    const reviewedAt = new Date();

    profile.status = DriverStatus.REJECTED;
    profile.rejectionReason = dto.profileReason ?? null;
    profile.approvedAt = null;
    profile.approvedByUserId = null;
    profile.suspensionReason = null;
    profile.suspendedAt = null;
    profile.suspendedByUserId = null;

    if (dto.vehicleReason) {
      vehicle.status = VehicleStatus.REJECTED;
      vehicle.rejectionReason = dto.vehicleReason;
    } else {
      vehicle.status = VehicleStatus.DRAFT;
      vehicle.rejectionReason = null;
    }

    for (const document of documents) {
      const reason = documentReasons.get(document.id);

      if (reason) {
        document.status = DriverDocumentStatus.REJECTED;
        document.rejectionReason = reason;
        document.reviewedAt = reviewedAt;
        document.reviewedByUserId = adminUserId;
      } else {
        document.status = DriverDocumentStatus.DRAFT;
        document.rejectionReason = null;
        document.reviewedAt = null;
        document.reviewedByUserId = null;
      }
    }

    await vehicleRepository.save(vehicle);
    await documentRepository.save(documents);
    await profileRepository.save(profile);
  }

  private async suspendWithinTransaction(
    manager: EntityManager,
    driverProfileId: string,
    adminUserId: string,
    reason: string,
  ): Promise<void> {
    const profileRepository = manager.getRepository(DriverProfile);
    const vehicleRepository = manager.getRepository(DriverVehicle);
    const userRepository = manager.getRepository(User);
    const operationalStateRepository = manager.getRepository(
      DriverOperationalState,
    );

    const profile = await this.lockProfile(profileRepository, driverProfileId);

    if (profile.status !== DriverStatus.APPROVED) {
      throw new BadRequestException(
        'Solo puede suspenderse un conductor aprobado',
      );
    }

    const vehicle = await this.lockVehicle(vehicleRepository, profile.id);

    if (!vehicle) {
      throw new BadRequestException(
        'El conductor no tiene un vehículo registrado',
      );
    }

    const user = await this.lockUser(userRepository, profile.userId);
    const operationalState = await this.getOrCreateOperationalState(
      operationalStateRepository,
      profile.id,
    );

    const suspendedAt = new Date();

    profile.status = DriverStatus.SUSPENDED;
    profile.suspensionReason = reason;
    profile.suspendedAt = suspendedAt;
    profile.suspendedByUserId = adminUserId;

    vehicle.status = VehicleStatus.SUSPENDED;
    vehicle.rejectionReason = null;

    user.roles = user.roles.filter((role) => role !== UserRole.DRIVER);

    operationalState.status = DriverOperationalStatus.OFFLINE;
    operationalState.disconnectedAt = suspendedAt;

    await userRepository.save(user);
    await vehicleRepository.save(vehicle);
    await operationalStateRepository.save(operationalState);
    await profileRepository.save(profile);
  }

  private async lockProfile(
    repository: Repository<DriverProfile>,
    driverProfileId: string,
  ): Promise<DriverProfile> {
    const profile = await repository
      .createQueryBuilder('profile')
      .where('profile.id = :driverProfileId', {
        driverProfileId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!profile) {
      throw new NotFoundException('La solicitud de conductor no existe');
    }

    return profile;
  }

  private lockVehicle(
    repository: Repository<DriverVehicle>,
    driverProfileId: string,
  ): Promise<DriverVehicle | null> {
    return repository
      .createQueryBuilder('vehicle')
      .where('vehicle.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .setLock('pessimistic_write')
      .getOne();
  }

  private lockDocuments(
    repository: Repository<DriverDocument>,
    driverProfileId: string,
  ): Promise<DriverDocument[]> {
    return repository
      .createQueryBuilder('document')
      .where('document.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .setLock('pessimistic_write')
      .orderBy('document.created_at', 'ASC')
      .getMany();
  }

  private async lockUser(
    repository: Repository<User>,
    userId: string,
  ): Promise<User> {
    const user = await repository
      .createQueryBuilder('user')
      .where('user.id = :userId', {
        userId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!user) {
      throw new NotFoundException('El usuario del conductor no existe');
    }

    return user;
  }

  private async getOrCreateOperationalState(
    repository: Repository<DriverOperationalState>,
    driverProfileId: string,
  ): Promise<DriverOperationalState> {
    const existingState = await repository
      .createQueryBuilder('state')
      .where('state.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (existingState) {
      return existingState;
    }

    return repository.create({
      driverProfileId,
      status: DriverOperationalStatus.OFFLINE,
      connectedAt: null,
      disconnectedAt: null,
      lastSeenAt: null,
    });
  }

  private assertPendingReview(profile: DriverProfile): void {
    if (profile.status !== DriverStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'La solicitud no está pendiente de revisión',
      );
    }
  }

  private assertUserCanBecomeDriver(user: User): void {
    if (user.status !== UserStatus.ACTIVE || !user.isPhoneVerified) {
      throw new BadRequestException(
        'La cuenta del solicitante no está habilitada',
      );
    }
  }

  private assertApprovalRequirements(
    vehicle: DriverVehicle,
    documents: DriverDocument[],
  ): void {
    const invalidRequirements: string[] = [];

    if (vehicle.status !== VehicleStatus.PENDING_REVIEW) {
      invalidRequirements.push(`DRIVER_VEHICLE_STATUS_${vehicle.status}`);
    }

    const documentsByType = new Map(
      documents.map((document) => [document.type, document]),
    );

    for (const requiredType of REQUIRED_DOCUMENT_TYPES) {
      const document = documentsByType.get(requiredType);

      if (!document) {
        invalidRequirements.push(`${requiredType}_MISSING`);

        continue;
      }

      if (document.status !== DriverDocumentStatus.PENDING_REVIEW) {
        invalidRequirements.push(`${requiredType}_STATUS_${document.status}`);
      }

      if (
        (requiredType === DriverDocumentType.DRIVER_LICENSE ||
          requiredType === DriverDocumentType.SOAT) &&
        (!document.expiresAt || document.expiresAt < this.getTodayIsoDate())
      ) {
        invalidRequirements.push(`${requiredType}_EXPIRED`);
      }
    }

    if (invalidRequirements.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'El expediente no cumple los requisitos de aprobación',
        invalidRequirements,
        error: 'Bad Request',
      });
    }
  }

  private assertRejectionHasObservations(
    dto: RejectDriverApplicationDto,
  ): void {
    const hasDocumentObservations = (dto.documents?.length ?? 0) > 0;

    if (!dto.profileReason && !dto.vehicleReason && !hasDocumentObservations) {
      throw new BadRequestException('Debes registrar al menos una observación');
    }
  }

  private createDocumentReasonMap(
    documents: DriverDocument[],
    dto: RejectDriverApplicationDto,
  ): Map<string, string> {
    const documentsById = new Map(
      documents.map((document) => [document.id, document]),
    );

    const reasons = new Map<string, string>();

    for (const observation of dto.documents ?? []) {
      if (reasons.has(observation.documentId)) {
        throw new BadRequestException(
          'No puedes observar dos veces el mismo documento',
        );
      }

      if (!documentsById.has(observation.documentId)) {
        throw new BadRequestException(
          'Uno de los documentos no pertenece al expediente',
        );
      }

      reasons.set(observation.documentId, observation.reason);
    }

    return reasons;
  }

  private getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
