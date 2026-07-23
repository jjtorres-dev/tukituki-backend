import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { RideReceiptResponseDto } from './dto/ride-receipt-response.dto';
import { RideFinalFare } from './entities/ride-final-fare.entity';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';

@Injectable()
export class RideReceiptsService {
  constructor(private readonly dataSource: DataSource) {}

  getPassengerReceipt(
    passengerUserId: string,
    rideId: string,
  ): Promise<RideReceiptResponseDto> {
    return this.getReceipt(rideId, { passengerUserId });
  }

  async getDriverReceipt(
    driverUserId: string,
    rideId: string,
  ): Promise<RideReceiptResponseDto> {
    const profile = await this.dataSource.getRepository(DriverProfile).findOne({
      where: { userId: driverUserId },
    });
    if (!profile) throw new NotFoundException('El perfil no existe');
    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado');
    }
    return this.getReceipt(rideId, { driverProfileId: profile.id });
  }

  private async getReceipt(
    rideId: string,
    owner: { passengerUserId?: string; driverProfileId?: string },
  ): Promise<RideReceiptResponseDto> {
    const rideRepository = this.dataSource.getRepository(Ride);
    const ride = owner.passengerUserId
      ? await rideRepository.findOne({
          where: {
            id: rideId,
            passengerUserId: owner.passengerUserId,
          },
        })
      : await rideRepository.findOne({
          where: {
            id: rideId,
            driverProfileId: owner.driverProfileId ?? '',
          },
        });

    if (!ride || ride.status !== RideStatus.COMPLETED) {
      throw new NotFoundException(
        'El comprobante no existe o el viaje todavía no finalizó',
      );
    }
    const fare = await this.dataSource.getRepository(RideFinalFare).findOne({
      where: { rideId: ride.id },
    });
    if (!fare || !ride.startedAt || !ride.completedAt) {
      throw new NotFoundException('El comprobante final no está disponible');
    }

    return {
      rideId: ride.id,
      status: ride.status,
      originAddress: ride.originAddress,
      destinationAddress: ride.destinationAddress,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      actualDistanceMeters: ride.actualDistanceMeters ?? 0,
      actualDurationSeconds: ride.actualDurationSeconds ?? 0,
      estimatedFare: ride.estimatedFare,
      completionNotes: ride.completionNotes,
      fare: {
        baseFare: fare.baseFare,
        distanceAmount: fare.distanceAmount,
        timeAmount: fare.timeAmount,
        bookingFee: fare.bookingFee,
        subtotal: fare.subtotal,
        adjustmentMultiplier: fare.adjustmentMultiplier,
        calculatedFinalFare: fare.calculatedFinalFare,
        finalFare: fare.finalFare,
        fareCapAmount: fare.fareCapAmount,
        fareWasCapped: fare.fareWasCapped,
        currency: fare.currency,
      },
    };
  }
}
