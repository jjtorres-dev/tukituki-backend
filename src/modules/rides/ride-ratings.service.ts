import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { RideRatingResponseDto } from './dto/ride-rating-response.dto';
import { SubmitRideRatingDto } from './dto/submit-ride-rating.dto';
import { RideRating } from './entities/ride-rating.entity';
import { Ride } from './entities/ride.entity';
import { RideRatingReviewerRole } from './enums/ride-rating-reviewer-role.enum';
import { RideRatingTag } from './enums/ride-rating-tag.enum';
import { RideStatus } from './enums/ride-status.enum';

const PASSENGER_RATING_TAGS = new Set<RideRatingTag>([
  RideRatingTag.SAFE_DRIVING,
  RideRatingTag.FRIENDLY,
  RideRatingTag.CLEAN_VEHICLE,
  RideRatingTag.PUNCTUAL,
  RideRatingTag.GOOD_COMMUNICATION,
]);

const DRIVER_RATING_TAGS = new Set<RideRatingTag>([
  RideRatingTag.PUNCTUAL,
  RideRatingTag.RESPECTFUL,
  RideRatingTag.CLEAR_PICKUP_POINT,
  RideRatingTag.GOOD_COMMUNICATION,
]);

interface RatingAggregateRow {
  ratingAverage: string;
  ratingCount: string | number;
}

interface RatingAggregate {
  average: string;
  count: number;
}

@Injectable()
export class RideRatingsService {
  constructor(private readonly dataSource: DataSource) {}

  rateDriver(
    passengerUserId: string,
    rideId: string,
    dto: SubmitRideRatingDto,
  ): Promise<RideRatingResponseDto> {
    return this.createRating(
      passengerUserId,
      rideId,
      RideRatingReviewerRole.PASSENGER,
      dto,
    );
  }

  ratePassenger(
    driverUserId: string,
    rideId: string,
    dto: SubmitRideRatingDto,
  ): Promise<RideRatingResponseDto> {
    return this.createRating(
      driverUserId,
      rideId,
      RideRatingReviewerRole.DRIVER,
      dto,
    );
  }

  private async createRating(
    reviewerUserId: string,
    rideId: string,
    reviewerRole: RideRatingReviewerRole,
    dto: SubmitRideRatingDto,
  ): Promise<RideRatingResponseDto> {
    this.assertTags(reviewerRole, dto.tags ?? []);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const ride = await this.lockRide(manager, rideId);
        this.assertCompleted(ride);

        const target =
          reviewerRole === RideRatingReviewerRole.PASSENGER
            ? await this.resolveDriverTarget(manager, ride, reviewerUserId)
            : await this.resolvePassengerTarget(manager, ride, reviewerUserId);

        if (target.reviewedUserId === reviewerUserId) {
          throw new ConflictException('No puedes calificarte a ti mismo');
        }

        const repository = manager.getRepository(RideRating);
        const rating = repository.create({
          rideId: ride.id,
          reviewerUserId,
          reviewedUserId: target.reviewedUserId,
          reviewerRole,
          score: dto.score,
          comment: this.normalizeComment(dto.comment),
          tags: dto.tags ?? [],
        });
        const saved = await repository.save(rating);
        const aggregate = await this.recalculateAggregate(
          manager,
          target.reviewedUserId,
          reviewerRole,
        );
        target.applyAggregate(aggregate);
        await target.save();

        return this.toResponse(saved, aggregate);
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya enviaste una calificación para este viaje',
        );
      }
      throw error;
    }
  }

  private async lockRide(
    manager: EntityManager,
    rideId: string,
  ): Promise<Ride> {
    const ride = await manager.getRepository(Ride).findOne({
      where: { id: rideId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!ride) {
      throw new NotFoundException('El viaje no existe');
    }
    return ride;
  }

  private assertCompleted(ride: Ride): void {
    if (ride.status !== RideStatus.COMPLETED) {
      throw new ConflictException(
        'Solo se pueden calificar viajes completados',
      );
    }
  }

  private async resolveDriverTarget(
    manager: EntityManager,
    ride: Ride,
    passengerUserId: string,
  ): Promise<{
    reviewedUserId: string;
    applyAggregate: (aggregate: RatingAggregate) => void;
    save: () => Promise<DriverProfile>;
  }> {
    if (ride.passengerUserId !== passengerUserId || !ride.driverProfileId) {
      throw new NotFoundException(
        'El viaje no existe o no pertenece al pasajero',
      );
    }

    const repository = manager.getRepository(DriverProfile);
    const profile = await this.lockDriverProfile(
      repository,
      ride.driverProfileId,
    );
    if (!profile) {
      throw new NotFoundException('El conductor del viaje no existe');
    }

    return {
      reviewedUserId: profile.userId,
      applyAggregate: (aggregate) => {
        profile.ratingAverage = aggregate.average;
        profile.ratingCount = aggregate.count;
      },
      save: () => repository.save(profile),
    };
  }

  private async resolvePassengerTarget(
    manager: EntityManager,
    ride: Ride,
    driverUserId: string,
  ): Promise<{
    reviewedUserId: string;
    applyAggregate: (aggregate: RatingAggregate) => void;
    save: () => Promise<PassengerProfile>;
  }> {
    if (!ride.driverProfileId) {
      throw new NotFoundException(
        'El viaje no existe o no pertenece al conductor',
      );
    }

    const driverProfile = await this.lockDriverProfile(
      manager.getRepository(DriverProfile),
      ride.driverProfileId,
    );
    if (!driverProfile || driverProfile.userId !== driverUserId) {
      throw new NotFoundException(
        'El viaje no existe o no pertenece al conductor',
      );
    }

    const repository = manager.getRepository(PassengerProfile);
    const passenger = await repository
      .createQueryBuilder('profile')
      .where('profile.user_id = :passengerUserId', {
        passengerUserId: ride.passengerUserId,
      })
      .setLock('pessimistic_write')
      .getOne();
    if (!passenger) {
      throw new ConflictException(
        'El pasajero no tiene un perfil disponible para reputación',
      );
    }

    return {
      reviewedUserId: ride.passengerUserId,
      applyAggregate: (aggregate) => {
        passenger.ratingAverage = aggregate.average;
        passenger.ratingCount = aggregate.count;
      },
      save: () => repository.save(passenger),
    };
  }

  private lockDriverProfile(
    repository: Repository<DriverProfile>,
    driverProfileId: string,
  ): Promise<DriverProfile | null> {
    return repository
      .createQueryBuilder('profile')
      .where('profile.id = :driverProfileId', { driverProfileId })
      .setLock('pessimistic_write')
      .getOne();
  }

  private async recalculateAggregate(
    manager: EntityManager,
    reviewedUserId: string,
    reviewerRole: RideRatingReviewerRole,
  ): Promise<RatingAggregate> {
    const result: unknown = await manager.query(
      `SELECT
         COALESCE(ROUND(AVG(score)::numeric, 2), 0.00)::text AS "ratingAverage",
         COUNT(*)::integer AS "ratingCount"
       FROM ride_ratings
       WHERE reviewed_user_id = $1
         AND reviewer_role = $2::ride_rating_reviewer_role_enum`,
      [reviewedUserId, reviewerRole],
    );
    const rows = result as RatingAggregateRow[];
    return {
      average: rows[0]?.ratingAverage ?? '0.00',
      count: Number(rows[0]?.ratingCount ?? 0),
    };
  }

  private assertTags(
    reviewerRole: RideRatingReviewerRole,
    tags: RideRatingTag[],
  ): void {
    const allowed =
      reviewerRole === RideRatingReviewerRole.PASSENGER
        ? PASSENGER_RATING_TAGS
        : DRIVER_RATING_TAGS;
    const invalid = tags.find((tag) => !allowed.has(tag));
    if (invalid) {
      throw new BadRequestException(
        `La etiqueta ${invalid} no corresponde al tipo de calificación`,
      );
    }
  }

  private normalizeComment(comment: string | undefined): string | null {
    const normalized = comment?.trim();
    return normalized ? normalized : null;
  }

  private toResponse(
    rating: RideRating,
    aggregate: RatingAggregate,
  ): RideRatingResponseDto {
    return {
      id: rating.id,
      rideId: rating.rideId,
      reviewerRole: rating.reviewerRole,
      score: rating.score,
      comment: rating.comment,
      tags: rating.tags,
      subjectRatingAverage: aggregate.average,
      subjectRatingCount: aggregate.count,
      createdAt: rating.createdAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const queryError = error as QueryFailedError & {
      driverError?: { code?: string };
    };
    return queryError.driverError?.code === '23505';
  }
}
