import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, MoreThanOrEqual } from 'typeorm';

import { RideStatus } from '../../rides/enums/ride-status.enum';
import { RideShareAccessLog } from '../entities/ride-share-access-log.entity';
import { RideShareLink } from '../entities/ride-share-link.entity';
import { RideShareLinkStatus } from '../enums/ride-share-link-status.enum';
import {
  hashRideShareAccessIp,
  hashRideShareToken,
} from '../ride-share-token.util';

const TERMINAL_STATUSES: readonly RideStatus[] = [
  RideStatus.COMPLETED,
  RideStatus.CANCELLED,
  RideStatus.EXPIRED,
];

@Injectable()
export class SharedRideAccessService {
  private readonly rateLimitMax: number;
  private readonly rateLimitWindowSeconds: number;
  private readonly accessHashSalt: string;

  constructor(
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.rateLimitMax = configService.get<number>(
      'RIDE_SHARE_RATE_LIMIT_MAX',
      60,
    );
    this.rateLimitWindowSeconds = configService.get<number>(
      'RIDE_SHARE_RATE_LIMIT_WINDOW_SECONDS',
      600,
    );
    this.accessHashSalt = configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  async validateAndRecord(
    token: string,
    ip: string,
    userAgent?: string,
  ): Promise<RideShareLink> {
    if (token.length < 20 || token.length > 200) {
      throw new NotFoundException('El enlace compartido no existe o venció');
    }
    const tokenHash = hashRideShareToken(token);
    const ipHash = hashRideShareAccessIp(ip || 'unknown', this.accessHashSalt);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RideShareLink);
      const link = await repository.findOne({
        where: { tokenHash },
        relations: { ride: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!link || link.status !== RideShareLinkStatus.ACTIVE) {
        throw new NotFoundException('El enlace compartido no existe o venció');
      }
      if (link.expiresAt.getTime() <= Date.now()) {
        link.status = RideShareLinkStatus.EXPIRED;
        await repository.save(link);
        throw new NotFoundException('El enlace compartido no existe o venció');
      }
      if (TERMINAL_STATUSES.includes(link.ride.status)) {
        throw new NotFoundException(
          'El enlace compartido ya no está disponible',
        );
      }
      const accessRepository = manager.getRepository(RideShareAccessLog);
      const count = await accessRepository.count({
        where: {
          shareLinkId: link.id,
          ipHash,
          accessedAt: MoreThanOrEqual(
            new Date(Date.now() - this.rateLimitWindowSeconds * 1000),
          ),
        },
      });
      if (count >= this.rateLimitMax) {
        throw new HttpException(
          'Demasiadas conexiones para este enlace',
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
      return repository.save(link);
    });
  }
}
