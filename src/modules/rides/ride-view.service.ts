import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import {
  DriverActiveRideResponseDto,
  RideAssignedPassengerResponseDto,
} from './dto/driver-active-ride-response.dto';
import { PassengerRideResponseDto } from './dto/passenger-ride-response.dto';
import { Ride } from './entities/ride.entity';

@Injectable()
export class RideViewService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly avatarResolver: AvatarUrlResolverService,
  ) {}

  async toPassengerResponse(ride: Ride): Promise<PassengerRideResponseDto> {
    let driver: PassengerRideResponseDto['driver'] = null;
    let driverLocation: PassengerRideResponseDto['driverLocation'] = null;

    if (ride.driverProfileId) {
      const [profile, vehicle, location] = await Promise.all([
        this.dataSource.getRepository(DriverProfile).findOne({
          where: { id: ride.driverProfileId },
        }),
        this.dataSource.getRepository(DriverVehicle).findOne({
          where: { driverProfileId: ride.driverProfileId },
        }),
        this.dataSource.getRepository(DriverLocation).findOne({
          where: { driverProfileId: ride.driverProfileId },
        }),
      ]);

      if (profile && vehicle) {
        driver = {
          profileId: profile.id,
          firstName: profile.firstName,
          photoUrl: this.avatarResolver.resolveDriverAvatarUrl(profile),
          ratingAverage: profile.ratingAverage,
          ratingCount: profile.ratingCount,
          vehicle: {
            plate: vehicle.plate,
            brand: vehicle.brand,
            model: vehicle.model,
            color: vehicle.color,
            vehicleType: vehicle.vehicleType,
          },
        };
      }

      if (location) {
        driverLocation = {
          latitude: location.latitude,
          longitude: location.longitude,
          heading: location.heading,
          speed: location.speed,
          accuracy: location.accuracy,
          recordedAt: location.recordedAt,
        };
      }
    }

    return {
      ...this.baseResponse(ride),
      driver,
      driverLocation,
    };
  }

  async toDriverResponse(
    ride: Ride,
    distanceToOriginMeters: number | null,
  ): Promise<DriverActiveRideResponseDto> {
    const passengerProfile = await this.dataSource
      .getRepository(PassengerProfile)
      .findOne({ where: { userId: ride.passengerUserId } });

    return {
      id: ride.id,
      status: ride.status,
      stateVersion: ride.stateVersion,
      origin: this.location(ride.originPosition, ride.originAddress),
      destination: this.location(
        ride.destinationPosition,
        ride.destinationAddress,
      ),
      distanceMeters: ride.distanceMeters,
      estimatedDurationSeconds: ride.estimatedDurationSeconds,
      estimatedFare: ride.estimatedFare,
      agreedFare: ride.agreedFare,
      currency: ride.currency,
      paymentMethod: ride.paymentMethod,
      passengerNotes: ride.passengerNotes,
      passenger: this.passengerSummary(passengerProfile),
      requestedAt: ride.requestedAt,
      driverAssignedAt: ride.driverAssignedAt,
      driverArrivingAt: ride.driverArrivingAt,
      driverArrivedAt: ride.driverArrivedAt,
      arrivalDistanceMeters: ride.arrivalDistanceMeters,
      distanceToOriginMeters,
    };
  }

  /**
   * Resumen mínimo del Passenger, sin apellido/teléfono/email/documento.
   * Degrada a null si el perfil no existe (nunca inventa "Pasajero" ni
   * un rating por defecto que no venga del propio perfil).
   */
  private passengerSummary(
    profile: PassengerProfile | null,
  ): RideAssignedPassengerResponseDto | null {
    if (!profile) {
      return null;
    }

    return {
      profileId: profile.id,
      firstName: profile.firstName,
      photoUrl: this.avatarResolver.resolvePassengerAvatarUrl(profile),
      ratingAverage: profile.ratingAverage,
      ratingCount: profile.ratingCount,
    };
  }

  private baseResponse(
    ride: Ride,
  ): Omit<PassengerRideResponseDto, 'driver' | 'driverLocation'> {
    return {
      id: ride.id,
      fareQuoteId: ride.fareQuoteId,
      driverProfileId: ride.driverProfileId,
      status: ride.status,
      stateVersion: ride.stateVersion,
      origin: this.location(ride.originPosition, ride.originAddress),
      destination: this.location(
        ride.destinationPosition,
        ride.destinationAddress,
      ),
      distanceMeters: ride.distanceMeters,
      estimatedDurationSeconds: ride.estimatedDurationSeconds,
      estimatedFare: ride.estimatedFare,
      passengerOfferFare: ride.passengerOfferFare,
      agreedFare: ride.agreedFare,
      finalFare: ride.finalFare,
      promotionCode: ride.promotionCode,
      estimatedDiscount: ride.estimatedDiscount,
      estimatedPassengerFare: ride.estimatedPassengerFare,
      finalDiscount: ride.finalDiscount,
      passengerAmountDue: ride.passengerAmountDue,
      currency: ride.currency,
      paymentMethod: ride.paymentMethod,
      passengerNotes: ride.passengerNotes,
      requestedAt: ride.requestedAt,
      searchExpiresAt: ride.searchExpiresAt,
      driverAssignedAt: ride.driverAssignedAt,
      driverArrivingAt: ride.driverArrivingAt,
      driverArrivedAt: ride.driverArrivedAt,
      arrivalDistanceMeters: ride.arrivalDistanceMeters,
      cancelledAt: ride.cancelledAt,
      cancellationReason: ride.cancellationReason,
      cancelledBy: ride.cancelledBy,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    };
  }

  private location(
    point: Ride['originPosition'],
    address: string,
  ): PassengerRideResponseDto['origin'] {
    return {
      latitude: point.coordinates[1],
      longitude: point.coordinates[0],
      address,
    };
  }
}
