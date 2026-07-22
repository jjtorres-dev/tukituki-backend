import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';
import { DriverOperationalState } from './entities/driver-operational-state.entity';
import { DriverOperationalStatus } from './enums/driver-operational-status.enum';

const REQUIRED_OPERATIONAL_DOCUMENTS: readonly DriverDocumentType[] = [
  DriverDocumentType.DRIVER_LICENSE,
  DriverDocumentType.SOAT,
];

@Injectable()
export class DriverOperationsService {
  private readonly logger = new Logger(DriverOperationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly availabilityRedisService: DriverAvailabilityRedisService,
  ) {}

  getMyStatus(userId: string): Promise<DriverOperationalState> {
    return this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedProfile(manager, userId);

      const stateRepository = manager.getRepository(DriverOperationalState);

      return this.getOrCreateState(stateRepository, profile.id);
    });
  }

  async goOnline(userId: string): Promise<DriverOperationalState> {
    const state = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedProfile(manager, userId);

      const vehicle = await this.lockVehicle(manager, profile.id);

      const documents = await this.lockOperationalDocuments(
        manager,
        profile.id,
      );

      this.assertCanGoOnline(vehicle, documents);

      const stateRepository = manager.getRepository(DriverOperationalState);

      const currentState = await this.getOrCreateState(
        stateRepository,
        profile.id,
      );

      if (currentState.status === DriverOperationalStatus.BUSY) {
        throw new BadRequestException(
          'No puedes cambiar a disponible mientras tienes un viaje activo',
        );
      }

      const now = new Date();

      if (currentState.status === DriverOperationalStatus.OFFLINE) {
        currentState.connectedAt = now;
      }

      currentState.status = DriverOperationalStatus.AVAILABLE;

      currentState.lastSeenAt = now;
      currentState.disconnectedAt = null;

      return stateRepository.save(currentState);
    });

    /*
     * Al conectarse no publicamos una posición antigua.
     * El siguiente PUT /drivers/me/location agregará al
     * conductor a Redis GEO con coordenadas actuales.
     */
    await this.safeRemoveDriverAvailability(state.driverProfileId);

    return state;
  }

  async goOffline(userId: string): Promise<DriverOperationalState> {
    const state = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedProfile(manager, userId);

      const stateRepository = manager.getRepository(DriverOperationalState);

      const currentState = await this.getOrCreateState(
        stateRepository,
        profile.id,
      );

      if (currentState.status === DriverOperationalStatus.BUSY) {
        throw new BadRequestException(
          'No puedes desconectarte mientras tienes un viaje activo',
        );
      }

      if (currentState.status === DriverOperationalStatus.OFFLINE) {
        if (!currentState.disconnectedAt) {
          currentState.disconnectedAt = new Date();

          return stateRepository.save(currentState);
        }

        return currentState;
      }

      currentState.status = DriverOperationalStatus.OFFLINE;

      currentState.disconnectedAt = new Date();

      return stateRepository.save(currentState);
    });

    await this.safeRemoveDriverAvailability(state.driverProfileId);

    return state;
  }

  async heartbeat(userId: string): Promise<DriverOperationalState> {
    const state = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedProfile(manager, userId);

      const stateRepository = manager.getRepository(DriverOperationalState);

      const currentState = await this.lockState(stateRepository, profile.id);

      if (
        !currentState ||
        currentState.status === DriverOperationalStatus.OFFLINE
      ) {
        throw new BadRequestException(
          'El conductor debe estar conectado para enviar heartbeat',
        );
      }

      currentState.lastSeenAt = new Date();

      return stateRepository.save(currentState);
    });

    if (state.status === DriverOperationalStatus.AVAILABLE) {
      await this.safeRenewPresence(state.driverProfileId);
    }

    return state;
  }

  private async lockApprovedProfile(
    manager: EntityManager,
    userId: string,
  ): Promise<DriverProfile> {
    const profile = await manager
      .getRepository(DriverProfile)
      .createQueryBuilder('profile')
      .where('profile.user_id = :userId', {
        userId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!profile) {
      throw new NotFoundException('El perfil de conductor no existe');
    }

    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado para operar');
    }

    return profile;
  }

  private lockVehicle(
    manager: EntityManager,
    driverProfileId: string,
  ): Promise<DriverVehicle | null> {
    return manager
      .getRepository(DriverVehicle)
      .createQueryBuilder('vehicle')
      .where('vehicle.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .setLock('pessimistic_write')
      .getOne();
  }

  private lockOperationalDocuments(
    manager: EntityManager,
    driverProfileId: string,
  ): Promise<DriverDocument[]> {
    return manager
      .getRepository(DriverDocument)
      .createQueryBuilder('document')
      .where('document.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .andWhere('document.type IN (:...types)', {
        types: REQUIRED_OPERATIONAL_DOCUMENTS,
      })
      .setLock('pessimistic_write')
      .getMany();
  }

  private assertCanGoOnline(
    vehicle: DriverVehicle | null,
    documents: DriverDocument[],
  ): void {
    const invalidRequirements: string[] = [];

    if (!vehicle) {
      invalidRequirements.push('DRIVER_VEHICLE_MISSING');
    } else if (vehicle.status !== VehicleStatus.APPROVED) {
      invalidRequirements.push(`DRIVER_VEHICLE_STATUS_${vehicle.status}`);
    }

    const documentsByType = new Map(
      documents.map((document) => [document.type, document]),
    );

    const today = this.getTodayIsoDate();

    for (const requiredType of REQUIRED_OPERATIONAL_DOCUMENTS) {
      const document = documentsByType.get(requiredType);

      if (!document) {
        invalidRequirements.push(`${requiredType}_MISSING`);

        continue;
      }

      if (document.status !== DriverDocumentStatus.APPROVED) {
        invalidRequirements.push(`${requiredType}_STATUS_${document.status}`);
      }

      if (!document.expiresAt) {
        invalidRequirements.push(`${requiredType}_EXPIRATION_MISSING`);
      } else if (document.expiresAt < today) {
        invalidRequirements.push(`${requiredType}_EXPIRED`);
      }
    }

    if (invalidRequirements.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'El conductor no cumple los requisitos para conectarse',
        invalidRequirements,
        error: 'Bad Request',
      });
    }
  }

  private async getOrCreateState(
    repository: Repository<DriverOperationalState>,
    driverProfileId: string,
  ): Promise<DriverOperationalState> {
    const existingState = await this.lockState(repository, driverProfileId);

    if (existingState) {
      return existingState;
    }

    const state = repository.create({
      driverProfileId,
      status: DriverOperationalStatus.OFFLINE,
      connectedAt: null,
      disconnectedAt: null,
      lastSeenAt: null,
    });

    return repository.save(state);
  }

  private lockState(
    repository: Repository<DriverOperationalState>,
    driverProfileId: string,
  ): Promise<DriverOperationalState | null> {
    return repository
      .createQueryBuilder('state')
      .where('state.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .setLock('pessimistic_write')
      .getOne();
  }

  private async safeRemoveDriverAvailability(
    driverProfileId: string,
  ): Promise<void> {
    try {
      await this.availabilityRedisService.removeDriverAvailability(
        driverProfileId,
      );
    } catch (error: unknown) {
      this.logger.error(
        `No se pudo limpiar la disponibilidad Redis del conductor ${driverProfileId}`,
        error,
      );
    }
  }

  private async safeRenewPresence(driverProfileId: string): Promise<void> {
    try {
      await this.availabilityRedisService.renewPresenceIfExists(
        driverProfileId,
      );
    } catch (error: unknown) {
      this.logger.error(
        `No se pudo renovar la presencia Redis del conductor ${driverProfileId}`,
        error,
      );
    }
  }

  private getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
