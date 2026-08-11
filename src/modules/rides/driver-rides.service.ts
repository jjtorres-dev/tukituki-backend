import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { RidePaymentResponseDto } from '../payments/dto/ride-payment-response.dto';
import { RidePayment } from '../payments/entities/ride-payment.entity';
import { RidePaymentStatus } from '../payments/enums/ride-payment-status.enum';
import { DriverActiveRideResponseDto } from './dto/driver-active-ride-response.dto';
import { DriverPendingCashPaymentResponseDto } from './dto/driver-pending-cash-payment-response.dto';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { RideViewService } from './ride-view.service';

const ACTIVE_DRIVER_RIDE_STATUSES: readonly RideStatus[] = [
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];

@Injectable()
export class DriverRidesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rideViewService: RideViewService,
  ) {}

  async getActiveRide(userId: string): Promise<DriverActiveRideResponseDto> {
    const profile = await this.getApprovedProfile(userId);
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: {
        driverProfileId: profile.id,
        status: In([...ACTIVE_DRIVER_RIDE_STATUSES]),
      },
      order: { driverAssignedAt: 'DESC' },
    });

    if (!ride) {
      throw new NotFoundException('El conductor no tiene un viaje activo');
    }

    return this.mapRide(profile.id, ride);
  }

  async getRide(
    userId: string,
    rideId: string,
  ): Promise<DriverActiveRideResponseDto> {
    const profile = await this.getApprovedProfile(userId);
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: {
        id: rideId,
        driverProfileId: profile.id,
      },
    });

    if (!ride) {
      throw new NotFoundException(
        'El viaje no existe o no pertenece al conductor',
      );
    }

    return this.mapRide(profile.id, ride);
  }

  /**
   * Rides COMPLETED del conductor autenticado cuyo RidePayment sigue
   * PENDING. Restore server-side para el caso en que el Driver cierre
   * la app entre `complete` y confirmar el cobro: `getActiveRide()`
   * ya no encuentra el ride (COMPLETED no es un status "activo") y
   * el operational status ya volvió a AVAILABLE, así que este es el
   * único camino para recuperar el `rideId` pendiente de cobro.
   *
   * No filtra por `method`: si algún día aparece un ride PENDING con
   * un método distinto de CASH, también se lista aquí (la pantalla de
   * cobro en efectivo es responsabilidad del cliente, no de esta
   * consulta). Orden determinista: más reciente primero por
   * `completedAt`, y por `payment.id` como desempate.
   */
  async listPendingCashPayments(
    userId: string,
  ): Promise<DriverPendingCashPaymentResponseDto[]> {
    const profile = await this.getApprovedProfile(userId);

    const payments = await this.dataSource
      .getRepository(RidePayment)
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.ride', 'ride')
      .where('payment.driver_profile_id = :driverProfileId', {
        driverProfileId: profile.id,
      })
      .andWhere('payment.status = :paymentStatus', {
        paymentStatus: RidePaymentStatus.PENDING,
      })
      .andWhere('ride.status = :rideStatus', {
        rideStatus: RideStatus.COMPLETED,
      })
      .orderBy('ride.completed_at', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .getMany();

    return payments.map((payment) => this.mapPendingCashPayment(payment));
  }

  private mapPendingCashPayment(
    payment: RidePayment,
  ): DriverPendingCashPaymentResponseDto {
    const ride = payment.ride;

    return {
      rideId: ride.id,
      rideStatus: ride.status,
      originAddress: ride.originAddress,
      destinationAddress: ride.destinationAddress,
      completedAt: ride.completedAt,
      finalFare: ride.finalFare,
      currency: ride.currency,
      payment: this.mapPayment(payment),
    };
  }

  private mapPayment(payment: RidePayment): RidePaymentResponseDto {
    return {
      id: payment.id,
      rideId: payment.rideId,
      passengerUserId: payment.passengerUserId,
      driverProfileId: payment.driverProfileId,
      method: payment.method,
      status: payment.status,
      amountDue: payment.amountDue,
      grossAmount: payment.grossAmount,
      discountAmount: payment.discountAmount,
      cashReceived: payment.cashReceived,
      changeGiven: payment.changeGiven,
      currency: payment.currency,
      confirmedByDriverUserId: payment.confirmedByDriverUserId,
      confirmedAt: payment.confirmedAt,
      confirmationNotes: payment.confirmationNotes,
      disputeReason: payment.disputeReason,
      disputeDetail: payment.disputeDetail,
      disputedAt: payment.disputedAt,
      resolvedByAdminUserId: payment.resolvedByAdminUserId,
      resolvedAt: payment.resolvedAt,
      resolutionNotes: payment.resolutionNotes,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private async getApprovedProfile(userId: string): Promise<DriverProfile> {
    const profile = await this.dataSource
      .getRepository(DriverProfile)
      .findOne({ where: { userId } });

    if (!profile) {
      throw new NotFoundException('El perfil de conductor no existe');
    }

    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado para operar');
    }

    return profile;
  }

  private async mapRide(
    driverProfileId: string,
    ride: Ride,
  ): Promise<DriverActiveRideResponseDto> {
    const location = await this.dataSource
      .getRepository(DriverLocation)
      .findOne({ where: { driverProfileId } });

    let distanceToOriginMeters: number | null = null;

    if (location) {
      const rows = await this.dataSource.query<
        Array<{ distanceMeters: string | number | null }>
      >(
        `SELECT ST_Distance(location.position, ride.origin_position) AS "distanceMeters"
         FROM driver_locations location
         INNER JOIN rides ride ON ride.id = $1
         WHERE location.driver_profile_id = $2
         LIMIT 1`,
        [ride.id, driverProfileId],
      );

      const distance = Number(rows[0]?.distanceMeters);
      distanceToOriginMeters = Number.isFinite(distance)
        ? Math.round(distance)
        : null;
    }

    return this.rideViewService.toDriverResponse(ride, distanceToOriginMeters);
  }
}
