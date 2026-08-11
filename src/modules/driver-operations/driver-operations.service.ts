import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import {
  DRIVER_PRESENCE_TTL_SECONDS,
  DriverAvailabilityRedisService,
} from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { Ride } from '../rides/entities/ride.entity';
import { ACTIVE_DRIVER_RIDE_STATUSES } from '../rides/ride-matching.constants';
import {
  assertDriverOperationalRequirements,
  REQUIRED_OPERATIONAL_DOCUMENTS,
} from './driver-operational-requirements.util';
import { DriverOperationalState } from './entities/driver-operational-state.entity';
import { DriverOperationalStatus } from './enums/driver-operational-status.enum';

@Injectable()
export class DriverOperationsService {
  private readonly logger = new Logger(DriverOperationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly availabilityRedisService: DriverAvailabilityRedisService,
  ) {}

  async getMyStatus(userId: string): Promise<DriverOperationalState> {
    const state = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedProfile(manager, userId);

      const stateRepository = manager.getRepository(DriverOperationalState);

      const currentState = await this.getOrCreateState(
        stateRepository,
        profile.id,
      );

      const now = new Date();

      if (
        currentState.status === DriverOperationalStatus.AVAILABLE &&
        this.isPresenceExpired(currentState.lastSeenAt, now)
      ) {
        currentState.status = DriverOperationalStatus.OFFLINE;
        currentState.disconnectedAt = now;

        return stateRepository.save(currentState);
      }

      return currentState;
    });

    if (state.status === DriverOperationalStatus.OFFLINE) {
      await this.safeRemoveDriverAvailability(state.driverProfileId);
    }

    return state;
  }

  async goOnline(userId: string): Promise<DriverOperationalState> {
    const state = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedProfile(manager, userId);

      const vehicle = await this.lockVehicle(manager, profile.id);

      const documents = await this.lockOperationalDocuments(
        manager,
        profile.id,
      );

      assertDriverOperationalRequirements(
        vehicle,
        documents,
        this.getTodayIsoDate(),
      );

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

      if (
        currentState.status === DriverOperationalStatus.OFFLINE ||
        this.isPresenceExpired(currentState.lastSeenAt, now)
      ) {
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
    const result = await this.dataSource.transaction(async (manager) => {
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

      const now = new Date();

      let shouldRegisterAvailablePresence = false;

      if (currentState.status === DriverOperationalStatus.AVAILABLE) {
        const presenceRenewed =
          await this.availabilityRedisService.renewPresenceIfExists(profile.id);

        if (!presenceRenewed) {
          const vehicle = await this.lockVehicle(manager, profile.id);

          const documents = await this.lockOperationalDocuments(
            manager,
            profile.id,
          );

          assertDriverOperationalRequirements(
            vehicle,
            documents,
            this.getTodayIsoDate(),
          );

          await this.assertNoActiveRide(manager, profile.id);

          if (this.isPresenceExpired(currentState.lastSeenAt, now)) {
            currentState.connectedAt = now;
          }

          shouldRegisterAvailablePresence = true;
        }
      }

      currentState.lastSeenAt = now;

      return {
        state: await stateRepository.save(currentState),
        shouldRegisterAvailablePresence,
      };
    });

    if (result.shouldRegisterAvailablePresence) {
      try {
        await this.availabilityRedisService.registerAvailablePresence(
          result.state.driverProfileId,
        );
      } catch {
        await this.compensateFailedAvailablePresence(result.state);

        throw new ServiceUnavailableException(
          'No se pudo reconstruir la presencia del conductor. Intenta nuevamente',
        );
      }
    }

    return result.state;
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

  private async assertNoActiveRide(
    manager: EntityManager,
    driverProfileId: string,
  ): Promise<void> {
    const activeRide = await manager
      .getRepository(Ride)
      .createQueryBuilder('ride')
      .where('ride.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .andWhere('ride.status IN (:...statuses)', {
        statuses: ACTIVE_DRIVER_RIDE_STATUSES,
      })
      .getOne();

    if (activeRide) {
      throw new BadRequestException(
        'El conductor tiene un viaje activo incompatible con AVAILABLE',
      );
    }
  }

  private async compensateFailedAvailablePresence(
    recoveredState: DriverOperationalState,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const stateRepository = manager.getRepository(DriverOperationalState);

        const currentState = await this.lockState(
          stateRepository,
          recoveredState.driverProfileId,
        );

        if (
          !currentState ||
          currentState.status !== DriverOperationalStatus.AVAILABLE ||
          currentState.lastSeenAt?.getTime() !==
            recoveredState.lastSeenAt?.getTime()
        ) {
          return;
        }

        currentState.status = DriverOperationalStatus.OFFLINE;
        currentState.disconnectedAt = new Date();

        await stateRepository.save(currentState);
      });

      await this.safeRemoveDriverAvailability(recoveredState.driverProfileId);
    } catch (error: unknown) {
      this.logger.error(
        `No se pudo compensar la presencia fallida del conductor ${recoveredState.driverProfileId}`,
        error,
      );
    }
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

  private getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private isPresenceExpired(lastSeenAt: Date | null, now: Date): boolean {
    if (!lastSeenAt) {
      return true;
    }

    return (
      now.getTime() - lastSeenAt.getTime() >= DRIVER_PRESENCE_TTL_SECONDS * 1000
    );
  }
}
