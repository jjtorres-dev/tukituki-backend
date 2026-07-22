import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
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
import { DriverLocationResponseDto } from './dto/driver-location-response.dto';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { DriverLocation } from './entities/driver-location.entity';
import type { DriverLocationPoint } from './entities/driver-location.entity';
import { DriverOperationalState } from './entities/driver-operational-state.entity';
import { DriverOperationalStatus } from './enums/driver-operational-status.enum';
import type { NearbyAvailableDriver } from './interfaces/nearby-available-driver.interface';

interface SavedLocationResult {
  location: DriverLocation;
  operationalStatus: DriverOperationalStatus;
}

@Injectable()
export class DriverLocationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly availabilityRedisService: DriverAvailabilityRedisService,
  ) {}

  async updateMyLocation(
    userId: string,
    dto: UpdateDriverLocationDto,
  ): Promise<DriverLocationResponseDto> {
    this.assertCoordinatesAreNotNullIsland(dto.latitude, dto.longitude);

    const result = await this.dataSource.transaction((manager) =>
      this.updateWithinTransaction(manager, userId, dto),
    );

    try {
      if (result.operationalStatus === DriverOperationalStatus.AVAILABLE) {
        await this.availabilityRedisService.publishAvailableDriver(
          result.location.driverProfileId,
          result.location.longitude,
          result.location.latitude,
        );
      } else {
        await this.availabilityRedisService.registerBusyPresence(
          result.location.driverProfileId,
        );
      }
    } catch {
      throw new ServiceUnavailableException(
        'La ubicación fue guardada, pero no pudo publicarse para disponibilidad. Intenta nuevamente',
      );
    }

    return this.mapLocation(result.location);
  }

  async getMyLocation(userId: string): Promise<DriverLocationResponseDto> {
    const location = await this.dataSource.transaction(async (manager) => {
      const profile = await this.getApprovedProfile(manager, userId);

      const foundLocation = await manager
        .getRepository(DriverLocation)
        .findOne({
          where: {
            driverProfileId: profile.id,
          },
        });

      if (!foundLocation) {
        throw new NotFoundException(
          'El conductor todavía no registra una ubicación',
        );
      }

      return foundLocation;
    });

    return this.mapLocation(location);
  }

  async findNearbyAvailableDrivers(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    limit: number,
  ): Promise<NearbyAvailableDriver[]> {
    this.assertSearchParameters(latitude, longitude, radiusMeters, limit);

    const candidates =
      await this.availabilityRedisService.findNearbyAvailableDrivers(
        longitude,
        latitude,
        radiusMeters,
        limit,
      );

    if (candidates.length === 0) {
      return [];
    }

    const candidateIds = candidates.map((candidate) => candidate.member);

    const eligibleStates = await this.dataSource
      .getRepository(DriverOperationalState)
      .createQueryBuilder('state')
      .innerJoin(
        DriverProfile,
        'profile',
        'profile.id = state.driver_profile_id',
      )
      .innerJoin(
        DriverVehicle,
        'vehicle',
        'vehicle.driver_profile_id = profile.id',
      )
      .innerJoin(
        DriverLocation,
        'location',
        'location.driver_profile_id = profile.id',
      )
      .innerJoin(
        DriverDocument,
        'license',
        `license.driver_profile_id = profile.id
            AND license.type = :licenseType`,
        {
          licenseType: DriverDocumentType.DRIVER_LICENSE,
        },
      )
      .innerJoin(
        DriverDocument,
        'soat',
        `soat.driver_profile_id = profile.id
            AND soat.type = :soatType`,
        {
          soatType: DriverDocumentType.SOAT,
        },
      )
      .where('state.driver_profile_id IN (:...driverProfileIds)', {
        driverProfileIds: candidateIds,
      })
      .andWhere('state.status = :operationalStatus', {
        operationalStatus: DriverOperationalStatus.AVAILABLE,
      })
      .andWhere('profile.status = :profileStatus', {
        profileStatus: DriverStatus.APPROVED,
      })
      .andWhere('vehicle.status = :vehicleStatus', {
        vehicleStatus: VehicleStatus.APPROVED,
      })
      .andWhere('location.recorded_at >= state.connected_at')
      .andWhere('license.status = :documentStatus', {
        documentStatus: DriverDocumentStatus.APPROVED,
      })
      .andWhere('soat.status = :documentStatus', {
        documentStatus: DriverDocumentStatus.APPROVED,
      })
      .andWhere('license.expires_at >= :today', {
        today: this.getTodayIsoDate(),
      })
      .andWhere('soat.expires_at >= :today', {
        today: this.getTodayIsoDate(),
      })
      .getMany();

    const eligibleIds = new Set(
      eligibleStates.map((state) => state.driverProfileId),
    );

    const invalidIds = candidateIds.filter(
      (driverProfileId) => !eligibleIds.has(driverProfileId),
    );

    await Promise.all(
      invalidIds.map((driverProfileId) =>
        this.availabilityRedisService
          .removeDriverAvailability(driverProfileId)
          .catch(() => undefined),
      ),
    );

    return candidates
      .filter((candidate) => eligibleIds.has(candidate.member))
      .map((candidate) => ({
        driverProfileId: candidate.member,
        distanceMeters: candidate.distanceMeters,
      }));
  }

  private async updateWithinTransaction(
    manager: EntityManager,
    userId: string,
    dto: UpdateDriverLocationDto,
  ): Promise<SavedLocationResult> {
    const profile = await this.lockApprovedProfile(manager, userId);

    const state = await this.lockOperationalState(manager, profile.id);

    if (
      !state ||
      (state.status !== DriverOperationalStatus.AVAILABLE &&
        state.status !== DriverOperationalStatus.BUSY)
    ) {
      throw new BadRequestException(
        'El conductor debe estar AVAILABLE o BUSY para actualizar su ubicación',
      );
    }

    const locationRepository = manager.getRepository(DriverLocation);

    const location = await this.getOrCreateLocation(
      locationRepository,
      profile.id,
    );

    const now = new Date();

    const point: DriverLocationPoint = {
      type: 'Point',
      coordinates: [dto.longitude, dto.latitude],
    };

    location.position = point;
    location.latitude = dto.latitude;
    location.longitude = dto.longitude;
    location.heading = dto.heading ?? null;
    location.speed = dto.speed ?? null;
    location.accuracy = dto.accuracy ?? null;
    location.recordedAt = now;

    state.lastSeenAt = now;

    await manager.getRepository(DriverOperationalState).save(state);

    const savedLocation = await locationRepository.save(location);

    return {
      location: savedLocation,
      operationalStatus: state.status,
    };
  }

  private async getApprovedProfile(
    manager: EntityManager,
    userId: string,
  ): Promise<DriverProfile> {
    const profile = await manager.getRepository(DriverProfile).findOne({
      where: {
        userId,
      },
    });

    if (!profile) {
      throw new NotFoundException('El perfil de conductor no existe');
    }

    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado para operar');
    }

    return profile;
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

  private lockOperationalState(
    manager: EntityManager,
    driverProfileId: string,
  ): Promise<DriverOperationalState | null> {
    return manager
      .getRepository(DriverOperationalState)
      .createQueryBuilder('state')
      .where('state.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .setLock('pessimistic_write')
      .getOne();
  }

  private async getOrCreateLocation(
    repository: Repository<DriverLocation>,
    driverProfileId: string,
  ): Promise<DriverLocation> {
    const existingLocation = await repository
      .createQueryBuilder('location')
      .where('location.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (existingLocation) {
      return existingLocation;
    }

    return repository.create({
      driverProfileId,
      position: {
        type: 'Point',
        coordinates: [0, 0],
      },
      latitude: 0,
      longitude: 0,
      heading: null,
      speed: null,
      accuracy: null,
      recordedAt: new Date(),
    });
  }

  private mapLocation(location: DriverLocation): DriverLocationResponseDto {
    return {
      id: location.id,
      driverProfileId: location.driverProfileId,
      latitude: location.latitude,
      longitude: location.longitude,
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
      recordedAt: location.recordedAt,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };
  }

  private getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private assertCoordinatesAreNotNullIsland(
    latitude: number,
    longitude: number,
  ): void {
    if (latitude === 0 && longitude === 0) {
      throw new BadRequestException(
        'Las coordenadas 0,0 no representan una ubicación válida',
      );
    }
  }

  private assertSearchParameters(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    limit: number,
  ): void {
    if (
      !Number.isFinite(latitude) ||
      latitude < -85.05112878 ||
      latitude > 85.05112878 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException(
        'Las coordenadas de búsqueda no son válidas',
      );
    }

    this.assertCoordinatesAreNotNullIsland(latitude, longitude);

    if (
      !Number.isFinite(radiusMeters) ||
      radiusMeters <= 0 ||
      radiusMeters > 20_000
    ) {
      throw new BadRequestException(
        'El radio debe ser mayor que 0 y no superar 20000 metros',
      );
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('El límite debe estar entre 1 y 100');
    }
  }
}
