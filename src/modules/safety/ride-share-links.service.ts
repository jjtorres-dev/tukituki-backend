import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, MoreThanOrEqual } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { Ride } from '../rides/entities/ride.entity';
import { RideStatus } from '../rides/enums/ride-status.enum';
import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { CreateRideShareLinkDto } from './dto/create-ride-share-link.dto';
import { PublicSharedRideResponseDto } from './dto/public-shared-ride-response.dto';
import { RideShareLinkResponseDto } from './dto/ride-share-link-response.dto';
import { RideShareAccessLog } from './entities/ride-share-access-log.entity';
import { RideShareLink } from './entities/ride-share-link.entity';
import { RideShareLinkStatus } from './enums/ride-share-link-status.enum';
import {
  generateRideShareToken,
  hashRideShareAccessIp,
  hashRideShareToken,
} from './ride-share-token.util';

const SHAREABLE_STATUSES: readonly RideStatus[] = [
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];
const LOCATION_VISIBLE_STATUSES: readonly RideStatus[] = [
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];
const TERMINAL_STATUSES: readonly RideStatus[] = [
  RideStatus.COMPLETED,
  RideStatus.CANCELLED,
  RideStatus.EXPIRED,
];

export interface ResolvedRideShareLink {
  link: RideShareLink;
  ride: Ride;
}

@Injectable()
export class RideShareLinksService {
  private readonly publicAppOrigin: string;
  private readonly defaultTtlMinutes: number;
  private readonly maxTtlMinutes: number;
  private readonly rateLimitMax: number;
  private readonly rateLimitWindowSeconds: number;
  private readonly accessHashSalt: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
    private readonly avatarResolver: AvatarUrlResolverService,
  ) {
    this.publicAppOrigin = this.configService
      .get<string>('PUBLIC_APP_ORIGIN', 'http://localhost:3000')
      .replace(/\/$/, '');
    this.defaultTtlMinutes = this.configService.get<number>(
      'RIDE_SHARE_DEFAULT_TTL_MINUTES',
      120,
    );
    this.maxTtlMinutes = this.configService.get<number>(
      'RIDE_SHARE_MAX_TTL_MINUTES',
      1440,
    );
    this.rateLimitMax = this.configService.get<number>(
      'RIDE_SHARE_RATE_LIMIT_MAX',
      60,
    );
    this.rateLimitWindowSeconds = this.configService.get<number>(
      'RIDE_SHARE_RATE_LIMIT_WINDOW_SECONDS',
      600,
    );
    this.accessHashSalt =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  async create(
    userId: string,
    rideId: string,
    dto: CreateRideShareLinkDto,
  ): Promise<RideShareLinkResponseDto> {
    const token = generateRideShareToken();
    const tokenHash = hashRideShareToken(token);
    const result = await this.dataSource.transaction(async (manager) => {
      const ride = await this.loadRideForParticipant(manager, userId, rideId);
      if (!SHAREABLE_STATUSES.includes(ride.status)) {
        throw new ConflictException(
          'El viaje no está en un estado que permita compartir ubicación',
        );
      }
      const repository = manager.getRepository(RideShareLink);
      const activeCount = await repository.count({
        where: {
          rideId,
          createdByUserId: userId,
          status: RideShareLinkStatus.ACTIVE,
        },
      });
      if (activeCount >= 3) {
        throw new ConflictException(
          'Ya tienes el máximo de tres enlaces activos para este viaje',
        );
      }
      const requestedTtl = dto.expiresInMinutes ?? this.defaultTtlMinutes;
      const ttlMinutes = Math.min(requestedTtl, this.maxTtlMinutes);
      const link = await repository.save(
        repository.create({
          rideId,
          createdByUserId: userId,
          tokenHash,
          status: RideShareLinkStatus.ACTIVE,
          expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
          revokedAt: null,
          lastAccessedAt: null,
          accessCount: 0,
        }),
      );
      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'RIDE_SHARE_LINK',
        aggregateId: link.id,
        eventType: OutboxEventType.RIDE_SHARE_LINK_CREATED,
        payload: {
          rideId,
          createdByUserId: userId,
          expiresAt: link.expiresAt.toISOString(),
        },
      });
      return link;
    });
    return this.mapLink(result, `${this.publicAppOrigin}/track/${token}`);
  }

  async list(
    userId: string,
    rideId: string,
  ): Promise<RideShareLinkResponseDto[]> {
    const ride = await this.assertParticipant(userId, rideId);
    if (TERMINAL_STATUSES.includes(ride.status)) {
      await this.expireAllActiveLinks(rideId);
    } else {
      await this.expireStaleLinks(rideId);
    }
    const links = await this.dataSource.getRepository(RideShareLink).find({
      where: { rideId, createdByUserId: userId },
      order: { createdAt: 'DESC' },
    });
    return links.map((link) => this.mapLink(link, null));
  }

  async revoke(
    userId: string,
    rideId: string,
    shareLinkId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.loadRideForParticipant(manager, userId, rideId);
      const repository = manager.getRepository(RideShareLink);
      const link = await repository.findOne({
        where: { id: shareLinkId, rideId, createdByUserId: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!link) throw new NotFoundException('El enlace compartido no existe');
      if (link.status === RideShareLinkStatus.REVOKED) return;
      link.status = RideShareLinkStatus.REVOKED;
      link.revokedAt = new Date();
      await repository.save(link);
      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'RIDE_SHARE_LINK',
        aggregateId: link.id,
        eventType: OutboxEventType.RIDE_SHARE_LINK_REVOKED,
        payload: { rideId, createdByUserId: userId },
      });
    });
  }

  async getPublic(
    token: string,
    ip: string,
    userAgent?: string,
  ): Promise<PublicSharedRideResponseDto> {
    const { link, ride } = await this.resolveAndRecordAccess(
      token,
      ip,
      userAgent,
    );
    const [vehicle, location] = await Promise.all([
      ride.driverProfileId
        ? this.dataSource.getRepository(DriverVehicle).findOne({
            where: { driverProfileId: ride.driverProfileId },
          })
        : Promise.resolve(null),
      ride.driverProfileId && LOCATION_VISIBLE_STATUSES.includes(ride.status)
        ? this.dataSource.getRepository(DriverLocation).findOne({
            where: { driverProfileId: ride.driverProfileId },
          })
        : Promise.resolve(null),
    ]);
    const origin = ride.originPosition.coordinates;
    const destination = ride.destinationPosition.coordinates;
    return {
      shareLinkId: link.id,
      rideStatus: ride.status,
      origin: {
        address: this.summarizeAddress(ride.originAddress),
        latitude: this.round(origin[1], 3),
        longitude: this.round(origin[0], 3),
      },
      destination: {
        address: this.summarizeAddress(ride.destinationAddress),
        latitude: this.round(destination[1], 3),
        longitude: this.round(destination[0], 3),
      },
      driver: ride.driverProfile
        ? {
            firstName: ride.driverProfile.firstName,
            photoUrl: this.avatarResolver.resolveDriverAvatarUrl(
              ride.driverProfile,
            ),
            vehicle: vehicle
              ? {
                  plate: vehicle.plate,
                  brand: vehicle.brand,
                  model: vehicle.model,
                  color: vehicle.color,
                }
              : null,
          }
        : null,
      driverLocation: location
        ? {
            latitude: this.round(location.latitude, 4),
            longitude: this.round(location.longitude, 4),
            heading: location.heading,
            recordedAt: location.recordedAt,
          }
        : null,
      requestedAt: ride.requestedAt,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      expiresAt: link.expiresAt,
      lastUpdatedAt: location?.recordedAt ?? ride.updatedAt,
    };
  }

  async resolveAndRecordAccess(
    token: string,
    ip: string,
    userAgent?: string,
  ): Promise<ResolvedRideShareLink> {
    if (token.length < 20 || token.length > 200) {
      throw new NotFoundException('El enlace compartido no existe o venció');
    }
    const tokenHash = hashRideShareToken(token);
    const ipHash = hashRideShareAccessIp(ip || 'unknown', this.accessHashSalt);
    return this.dataSource.transaction(async (manager) => {
      const linkRepository = manager.getRepository(RideShareLink);
      const link = await linkRepository.findOne({
        where: { tokenHash },
        relations: { ride: { driverProfile: true } },
        lock: { mode: 'pessimistic_write' },
      });
      if (!link || link.status !== RideShareLinkStatus.ACTIVE) {
        throw new NotFoundException('El enlace compartido no existe o venció');
      }
      if (link.expiresAt.getTime() <= Date.now()) {
        link.status = RideShareLinkStatus.EXPIRED;
        await linkRepository.save(link);
        throw new NotFoundException('El enlace compartido no existe o venció');
      }
      if (TERMINAL_STATUSES.includes(link.ride.status)) {
        throw new NotFoundException(
          'El enlace compartido ya no está disponible',
        );
      }
      const windowStart = new Date(
        Date.now() - this.rateLimitWindowSeconds * 1000,
      );
      const accessRepository = manager.getRepository(RideShareAccessLog);
      const recentAccesses = await accessRepository.count({
        where: {
          shareLinkId: link.id,
          ipHash,
          accessedAt: MoreThanOrEqual(windowStart),
        },
      });
      if (recentAccesses >= this.rateLimitMax) {
        throw new HttpException(
          'Demasiadas consultas para este enlace',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const now = new Date();
      await accessRepository.save(
        accessRepository.create({
          shareLinkId: link.id,
          ipHash,
          userAgent: userAgent?.slice(0, 500) || null,
          accessedAt: now,
        }),
      );
      link.lastAccessedAt = now;
      link.accessCount += 1;
      await linkRepository.save(link);
      return { link, ride: link.ride };
    });
  }

  private async assertParticipant(
    userId: string,
    rideId: string,
  ): Promise<Ride> {
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: { id: rideId },
      relations: { driverProfile: true },
    });
    if (!ride) throw new NotFoundException('El viaje no existe');
    if (
      ride.passengerUserId !== userId &&
      ride.driverProfile?.userId !== userId
    ) {
      throw new ForbiddenException('El viaje no pertenece al usuario');
    }
    return ride;
  }

  private async loadRideForParticipant(
    manager: EntityManager,
    userId: string,
    rideId: string,
  ): Promise<Ride> {
    const ride = await manager.getRepository(Ride).findOne({
      where: { id: rideId },
      relations: { driverProfile: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!ride) throw new NotFoundException('El viaje no existe');
    if (
      ride.passengerUserId !== userId &&
      ride.driverProfile?.userId !== userId
    ) {
      throw new ForbiddenException('El viaje no pertenece al usuario');
    }
    return ride;
  }

  private async expireAllActiveLinks(rideId: string): Promise<void> {
    await this.dataSource.getRepository(RideShareLink).update(
      {
        rideId,
        status: RideShareLinkStatus.ACTIVE,
      },
      { status: RideShareLinkStatus.EXPIRED },
    );
  }

  private async expireStaleLinks(rideId: string): Promise<void> {
    await this.dataSource
      .getRepository(RideShareLink)
      .createQueryBuilder()
      .update()
      .set({ status: RideShareLinkStatus.EXPIRED })
      .where('ride_id = :rideId', { rideId })
      .andWhere('status = :status', { status: RideShareLinkStatus.ACTIVE })
      .andWhere('expires_at <= NOW()')
      .execute();
  }

  private mapLink(
    link: RideShareLink,
    shareUrl: string | null,
  ): RideShareLinkResponseDto {
    return {
      id: link.id,
      rideId: link.rideId,
      status: link.status,
      shareUrl,
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt,
      lastAccessedAt: link.lastAccessedAt,
      accessCount: link.accessCount,
      createdAt: link.createdAt,
    };
  }

  private summarizeAddress(address: string): string {
    const normalized = address.trim().replace(/\s+/g, ' ');
    const firstSegment = normalized.split(',')[0]?.trim();
    return (firstSegment || normalized).slice(0, 120);
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
