import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager, FindOneOptions } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { OutboxService } from '../outbox/outbox.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { CancellationFeeCalculatorService } from './cancellation-fee-calculator.service';
import { RideDispatchService } from './ride-dispatch.service';
import { Ride } from './entities/ride.entity';
import { DriverCancellationReason } from './enums/driver-cancellation-reason.enum';
import { PassengerCancellationReason } from './enums/passenger-cancellation-reason.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideCancellationsService } from './ride-cancellations.service';
import { RideStartCodesService } from './ride-start-codes.service';
import { RideTransitionsService } from './ride-transitions.service';

function createService(dataSource: DataSource): RideCancellationsService {
  return new RideCancellationsService(
    dataSource,
    new CancellationFeeCalculatorService(),
    {} as RideTransitionsService,
    {} as RideStartCodesService,
    {} as RideDispatchService,
    {} as RideRealtimeService,
    {} as DriverAvailabilityRedisService,
    {} as OutboxService,
  );
}

describe('RideCancellationsService', () => {
  const passengerUserId = '934d221b-b869-477d-9480-f6f96d561737';
  const rideId = 'd041f35e-0e19-491d-85b4-dc551edc8a3b';

  it('calcula una vista previa sin modificar el viaje', async () => {
    const ride = Object.assign(new Ride(), {
      id: rideId,
      passengerUserId,
      status: RideStatus.DRIVER_ARRIVING,
      cancellationArrivingFee: '1.50',
      currency: 'PEN',
    });
    const findOne = jest.fn<Promise<Ride | null>, [FindOneOptions<Ride>?]>(() =>
      Promise.resolve(ride),
    );
    const dataSource = {
      getRepository: jest.fn(() => ({ findOne })),
    } as unknown as DataSource;
    const service = createService(dataSource);

    const result = await service.previewPassengerCancellation(
      passengerUserId,
      rideId,
      { reason: PassengerCancellationReason.CHANGED_MIND },
    );

    expect(result).toEqual({
      rideId,
      rideStatus: RideStatus.DRIVER_ARRIVING,
      canCancel: true,
      gracePeriodExpired: true,
      calculatedFee: '1.50',
      currency: 'PEN',
      reason: PassengerCancellationReason.CHANGED_MIND,
      requiresConfirmation: true,
    });
    expect(ride.status).toBe(RideStatus.DRIVER_ARRIVING);
  });

  it('oculta viajes pertenecientes a otro pasajero', async () => {
    const findOne = jest.fn<Promise<Ride | null>, [FindOneOptions<Ride>?]>(() =>
      Promise.resolve(null),
    );
    const dataSource = {
      getRepository: jest.fn(() => ({ findOne })),
    } as unknown as DataSource;
    const service = createService(dataSource);

    await expect(
      service.previewPassengerCancellation(passengerUserId, rideId, {
        reason: PassengerCancellationReason.OTHER,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('obliga a usar el flujo de espera para PASSENGER_NOT_FOUND', async () => {
    const transaction = jest.fn();
    const dataSource = { transaction } as unknown as DataSource;
    const service = createService(dataSource);

    await expect(
      service.cancelByDriver('251c564f-e01e-4071-a8f8-e107b4a427a2', rideId, {
        reason: DriverCancellationReason.PASSENGER_NOT_FOUND,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('habilita la cancelacion para Passenger ACTIVE no verificado', async () => {
    const passenger = {
      id: passengerUserId,
      roles: [UserRole.PASSENGER],
      status: UserStatus.ACTIVE,
      isPhoneVerified: false,
    } as User;
    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(() => Promise.resolve(passenger)),
      })),
    } as unknown as EntityManager;
    const service = createService({} as DataSource);
    const passengerGuard = service as unknown as {
      lockEnabledPassenger(
        entityManager: EntityManager,
        userId: string,
      ): Promise<User>;
    };

    await expect(
      passengerGuard.lockEnabledPassenger(manager, passengerUserId),
    ).resolves.toBe(passenger);
  });
});
