import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { VehicleType } from '../drivers/enums/vehicle-type.enum';
import { DriverRideHistoryResponseDto } from './dto/driver-ride-history-response.dto';
import {
  PassengerRideHistoryResponseDto,
  RideHistoryPaginationDto,
} from './dto/passenger-ride-history-response.dto';
import {
  RIDE_HISTORY_STATUSES,
  RideHistoryQueryDto,
} from './dto/ride-history-query.dto';
import { RideStatus } from './enums/ride-status.enum';

interface CountRow {
  total: string | number;
}

interface PassengerHistoryRow {
  rideId: string;
  status: RideStatus;
  originAddress: string;
  destinationAddress: string;
  requestedAt: Date | string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  cancelledAt: Date | string | null;
  actualDistanceMeters: number | string | null;
  actualDurationSeconds: number | string | null;
  estimatedFare: string;
  finalFare: string | null;
  currency: string;
  driverProfileId: string | null;
  driverFirstName: string | null;
  driverPhotoUrl: string | null;
  driverRatingAverage: string | null;
  driverRatingCount: number | string | null;
  vehiclePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehicleType: VehicleType | null;
  ratingSubmitted: boolean;
}

interface DriverHistoryRow {
  rideId: string;
  status: RideStatus;
  originAddress: string;
  destinationAddress: string;
  requestedAt: Date | string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  cancelledAt: Date | string | null;
  actualDistanceMeters: number | string | null;
  actualDurationSeconds: number | string | null;
  estimatedFare: string;
  finalFare: string | null;
  currency: string;
  passengerFirstName: string | null;
  passengerPhotoUrl: string | null;
  passengerRatingAverage: string | null;
  passengerRatingCount: number | string | null;
  ratingSubmitted: boolean;
}

interface HistoryFilter {
  clauses: string[];
  parameters: unknown[];
}

@Injectable()
export class RideHistoryService {
  constructor(private readonly dataSource: DataSource) {}

  async getPassengerHistory(
    passengerUserId: string,
    query: RideHistoryQueryDto,
  ): Promise<PassengerRideHistoryResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = this.buildFilter(query, 2);
    const parameters: unknown[] = [passengerUserId, ...filter.parameters];
    const where = [
      'ride.passenger_user_id = $1',
      `ride.status IN ('COMPLETED', 'CANCELLED', 'EXPIRED')`,
      ...filter.clauses,
    ].join(' AND ');

    const total = await this.count(where, parameters);
    const offset = (page - 1) * limit;
    const limitIndex = parameters.length + 1;
    const offsetIndex = parameters.length + 2;
    const result: unknown = await this.dataSource.query(
      `SELECT
         ride.id AS "rideId",
         ride.status AS "status",
         ride.origin_address AS "originAddress",
         ride.destination_address AS "destinationAddress",
         ride.requested_at AS "requestedAt",
         ride.started_at AS "startedAt",
         ride.completed_at AS "completedAt",
         ride.cancelled_at AS "cancelledAt",
         ride.actual_distance_meters AS "actualDistanceMeters",
         ride.actual_duration_seconds AS "actualDurationSeconds",
         ride.estimated_fare AS "estimatedFare",
         ride.final_fare AS "finalFare",
         ride.currency AS "currency",
         driver.id AS "driverProfileId",
         driver.first_name AS "driverFirstName",
         driver.photo_url AS "driverPhotoUrl",
         driver.rating_average AS "driverRatingAverage",
         driver.rating_count AS "driverRatingCount",
         vehicle.plate AS "vehiclePlate",
         vehicle.brand AS "vehicleBrand",
         vehicle.model AS "vehicleModel",
         vehicle.color AS "vehicleColor",
         vehicle.vehicle_type AS "vehicleType",
         EXISTS (
           SELECT 1
           FROM ride_ratings rating
           WHERE rating.ride_id = ride.id
             AND rating.reviewer_user_id = $1
         ) AS "ratingSubmitted"
       FROM rides ride
       LEFT JOIN driver_profiles driver
         ON driver.id = ride.driver_profile_id
       LEFT JOIN driver_vehicles vehicle
         ON vehicle.driver_profile_id = driver.id
       WHERE ${where}
       ORDER BY ride.requested_at DESC, ride.id DESC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      [...parameters, limit, offset],
    );
    const rows = result as PassengerHistoryRow[];

    return {
      items: rows.map((row) => ({
        rideId: row.rideId,
        status: row.status,
        originAddress: row.originAddress,
        destinationAddress: row.destinationAddress,
        requestedAt: this.date(row.requestedAt),
        startedAt: this.nullableDate(row.startedAt),
        completedAt: this.nullableDate(row.completedAt),
        cancelledAt: this.nullableDate(row.cancelledAt),
        actualDistanceMeters: this.nullableNumber(row.actualDistanceMeters),
        actualDurationSeconds: this.nullableNumber(row.actualDurationSeconds),
        estimatedFare: row.estimatedFare,
        finalFare: row.finalFare,
        currency: row.currency,
        driver: this.passengerDriver(row),
        ratingSubmitted: row.ratingSubmitted,
        canRate:
          row.status === RideStatus.COMPLETED &&
          row.driverProfileId !== null &&
          !row.ratingSubmitted,
      })),
      pagination: this.pagination(page, limit, total),
    };
  }

  async getDriverHistory(
    driverUserId: string,
    query: RideHistoryQueryDto,
  ): Promise<DriverRideHistoryResponseDto> {
    const profile = await this.dataSource.getRepository(DriverProfile).findOne({
      where: { userId: driverUserId },
    });
    if (!profile) {
      throw new NotFoundException('El perfil de conductor no existe');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const listFilter = this.buildFilter(query, 3);
    const parameters: unknown[] = [
      profile.id,
      driverUserId,
      ...listFilter.parameters,
    ];
    const where = [
      'ride.driver_profile_id = $1',
      `ride.status IN ('COMPLETED', 'CANCELLED', 'EXPIRED')`,
      ...listFilter.clauses,
    ].join(' AND ');

    const countFilter = this.buildFilter(query, 2);
    const countWhere = [
      'ride.driver_profile_id = $1',
      `ride.status IN ('COMPLETED', 'CANCELLED', 'EXPIRED')`,
      ...countFilter.clauses,
    ].join(' AND ');
    const total = await this.count(countWhere, [
      profile.id,
      ...countFilter.parameters,
    ]);

    const offset = (page - 1) * limit;
    const limitIndex = parameters.length + 1;
    const offsetIndex = parameters.length + 2;
    const result: unknown = await this.dataSource.query(
      `SELECT
         ride.id AS "rideId",
         ride.status AS "status",
         ride.origin_address AS "originAddress",
         ride.destination_address AS "destinationAddress",
         ride.requested_at AS "requestedAt",
         ride.started_at AS "startedAt",
         ride.completed_at AS "completedAt",
         ride.cancelled_at AS "cancelledAt",
         ride.actual_distance_meters AS "actualDistanceMeters",
         ride.actual_duration_seconds AS "actualDurationSeconds",
         ride.estimated_fare AS "estimatedFare",
         ride.final_fare AS "finalFare",
         ride.currency AS "currency",
         passenger.first_name AS "passengerFirstName",
         passenger.photo_url AS "passengerPhotoUrl",
         passenger.rating_average AS "passengerRatingAverage",
         passenger.rating_count AS "passengerRatingCount",
         EXISTS (
           SELECT 1
           FROM ride_ratings rating
           WHERE rating.ride_id = ride.id
             AND rating.reviewer_user_id = $2
         ) AS "ratingSubmitted"
       FROM rides ride
       LEFT JOIN passenger_profiles passenger
         ON passenger.user_id = ride.passenger_user_id
       WHERE ${where}
       ORDER BY ride.requested_at DESC, ride.id DESC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      [...parameters, limit, offset],
    );
    const rows = result as DriverHistoryRow[];

    return {
      items: rows.map((row) => ({
        rideId: row.rideId,
        status: row.status,
        originAddress: row.originAddress,
        destinationAddress: row.destinationAddress,
        requestedAt: this.date(row.requestedAt),
        startedAt: this.nullableDate(row.startedAt),
        completedAt: this.nullableDate(row.completedAt),
        cancelledAt: this.nullableDate(row.cancelledAt),
        actualDistanceMeters: this.nullableNumber(row.actualDistanceMeters),
        actualDurationSeconds: this.nullableNumber(row.actualDurationSeconds),
        estimatedFare: row.estimatedFare,
        finalFare: row.finalFare,
        currency: row.currency,
        passenger:
          row.passengerFirstName === null
            ? null
            : {
                firstName: row.passengerFirstName,
                photoUrl: row.passengerPhotoUrl,
                ratingAverage: row.passengerRatingAverage ?? '0.00',
                ratingCount: Number(row.passengerRatingCount ?? 0),
              },
        ratingSubmitted: row.ratingSubmitted,
        canRate:
          row.status === RideStatus.COMPLETED &&
          row.passengerFirstName !== null &&
          !row.ratingSubmitted,
      })),
      pagination: this.pagination(page, limit, total),
    };
  }

  private buildFilter(
    query: RideHistoryQueryDto,
    firstParameterIndex: number,
  ): HistoryFilter {
    if (
      query.status !== undefined &&
      !RIDE_HISTORY_STATUSES.includes(query.status)
    ) {
      throw new BadRequestException(
        'El historial solo admite viajes COMPLETED, CANCELLED o EXPIRED',
      );
    }

    const clauses: string[] = [];
    const parameters: unknown[] = [];
    let parameterIndex = firstParameterIndex;

    if (query.status !== undefined) {
      clauses.push(`ride.status = $${parameterIndex}::ride_status_enum`);
      parameters.push(query.status);
      parameterIndex += 1;
    }

    const from = query.dateFrom
      ? this.parseUtcDate(query.dateFrom, 'dateFrom')
      : null;
    const to = query.dateTo ? this.parseUtcDate(query.dateTo, 'dateTo') : null;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('dateFrom no puede ser posterior a dateTo');
    }

    if (from) {
      clauses.push(`ride.requested_at >= $${parameterIndex}`);
      parameters.push(from);
      parameterIndex += 1;
    }

    if (to) {
      clauses.push(`ride.requested_at < $${parameterIndex}`);
      parameters.push(new Date(to.getTime() + 24 * 60 * 60 * 1000));
    }

    return { clauses, parameters };
  }

  private async count(where: string, parameters: unknown[]): Promise<number> {
    const result: unknown = await this.dataSource.query(
      `SELECT COUNT(*)::integer AS "total"
       FROM rides ride
       WHERE ${where}`,
      parameters,
    );
    const rows = result as CountRow[];
    return Number(rows[0]?.total ?? 0);
  }

  private passengerDriver(
    row: PassengerHistoryRow,
  ): PassengerRideHistoryResponseDto['items'][number]['driver'] {
    if (
      !row.driverProfileId ||
      !row.driverFirstName ||
      !row.vehiclePlate ||
      !row.vehicleBrand ||
      !row.vehicleModel ||
      !row.vehicleColor ||
      !row.vehicleType
    ) {
      return null;
    }

    return {
      profileId: row.driverProfileId,
      firstName: row.driverFirstName,
      photoUrl: row.driverPhotoUrl,
      vehiclePlate: row.vehiclePlate,
      vehicleBrand: row.vehicleBrand,
      vehicleModel: row.vehicleModel,
      vehicleColor: row.vehicleColor,
      vehicleType: row.vehicleType,
      ratingAverage: row.driverRatingAverage ?? '0.00',
      ratingCount: Number(row.driverRatingCount ?? 0),
    };
  }

  private pagination(
    page: number,
    limit: number,
    totalItems: number,
  ): RideHistoryPaginationDto {
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
    return {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && totalPages > 0,
    };
  }

  private parseUtcDate(value: string, field: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`${field} no contiene una fecha válida`);
    }
    return date;
  }

  private date(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  private nullableDate(value: Date | string | null): Date | null {
    return value === null ? null : this.date(value);
  }

  private nullableNumber(value: number | string | null): number | null {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
