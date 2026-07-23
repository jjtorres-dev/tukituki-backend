import { BadRequestException, Injectable } from '@nestjs/common';

import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';

export interface CancellationFeeCalculation {
  fee: string;
  gracePeriodExpired: boolean;
}

@Injectable()
export class CancellationFeeCalculatorService {
  calculatePassengerFee(ride: Ride, at: Date): CancellationFeeCalculation {
    switch (ride.status) {
      case RideStatus.SEARCHING_DRIVER:
        return { fee: '0.00', gracePeriodExpired: false };
      case RideStatus.DRIVER_ASSIGNED: {
        const graceSeconds = ride.cancellationGracePeriodSeconds ?? 60;
        const assignedAt = ride.driverAssignedAt;
        const gracePeriodExpired =
          assignedAt !== null &&
          at.getTime() - assignedAt.getTime() >= graceSeconds * 1000;
        return {
          fee: gracePeriodExpired
            ? (ride.cancellationAssignedFee ?? '1.00')
            : '0.00',
          gracePeriodExpired,
        };
      }
      case RideStatus.DRIVER_ARRIVING:
        return {
          fee: ride.cancellationArrivingFee ?? '1.50',
          gracePeriodExpired: true,
        };
      case RideStatus.DRIVER_ARRIVED:
        return {
          fee: ride.cancellationArrivedFee ?? '2.00',
          gracePeriodExpired: true,
        };
      default:
        throw new BadRequestException(
          'El viaje ya no puede cancelarse mediante el flujo estándar',
        );
    }
  }

  passengerNoShowFee(ride: Ride): string {
    return ride.passengerNoShowFee ?? '2.50';
  }

  driverCompensation(ride: Ride): string {
    return ride.driverNoShowCompensation ?? '1.50';
  }
}
