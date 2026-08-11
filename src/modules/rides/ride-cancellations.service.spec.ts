import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager, FindOneOptions, FindOperator } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { OutboxService } from '../outbox/outbox.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { CancellationFeeCalculatorService } from './cancellation-fee-calculator.service';
import { RideDispatchService } from './ride-dispatch.service';
import { RideCancellation } from './entities/ride-cancellation.entity';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { DriverCancellationReason } from './enums/driver-cancellation-reason.enum';
import { PassengerCancellationReason } from './enums/passenger-cancellation-reason.enum';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
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
  const cancellationId = 'd312ef5c-a64d-477f-a801-b8517131fd7c';
  const driverProfileId = 'a941219a-b21c-4b1c-9091-f1d5276ab14f';

  function createRide(status: RideStatus, overrides: Partial<Ride> = {}): Ride {
    return Object.assign(new Ride(), {
      id: rideId,
      passengerUserId,
      status,
      stateVersion: 1,
      currency: 'PEN',
      driverProfileId: null,
      driverAssignedAt: null,
      cancellationGracePeriodSeconds: 60,
      ...overrides,
    });
  }

  function createPassengerCancellationHarness(input: {
    ride: Ride | null;
    offerStatuses?: RideOfferStatus[];
    existingCancellation?: RideCancellation | null;
    driverState?: DriverOperationalState | null;
  }): {
    service: RideCancellationsService;
    offers: RideOffer[];
    offerUpdate: jest.Mock;
    driverStateSave: jest.Mock;
    restoreDriverAvailability: jest.Mock;
  } {
    const passenger = Object.assign(new User(), {
      id: passengerUserId,
      roles: [UserRole.PASSENGER],
      status: UserStatus.ACTIVE,
      isPhoneVerified: false,
    });
    const offers = (input.offerStatuses ?? []).map((status, index) =>
      Object.assign(new RideOffer(), {
        id: 'offer-' + String(index),
        rideId,
        driverProfileId: 'driver-' + String(index),
        status,
        respondedAt: null,
        cancelledAt: null,
      }),
    );
    const offerUpdate = jest.fn(
      (
        criteria: {
          rideId: string;
          status: FindOperator<RideOfferStatus>;
        },
        values: Partial<RideOffer>,
      ) => {
        const statuses = criteria.status.value as unknown as RideOfferStatus[];
        for (const offer of offers) {
          if (
            offer.rideId === criteria.rideId &&
            statuses.includes(offer.status)
          ) {
            Object.assign(offer, values);
          }
        }
        return Promise.resolve();
      },
    );
    const cancellationRepository = {
      findOne: jest.fn(() =>
        Promise.resolve(input.existingCancellation ?? null),
      ),
      create: jest.fn((values: Partial<RideCancellation>) =>
        Object.assign(new RideCancellation(), values, { id: cancellationId }),
      ),
      save: jest.fn((cancellation: RideCancellation) =>
        Promise.resolve(cancellation),
      ),
    };
    const driverStateSave = jest.fn((state: DriverOperationalState) =>
      Promise.resolve(state),
    );
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) {
          return { findOne: jest.fn(() => Promise.resolve(passenger)) };
        }
        if (entity === Ride) {
          return { findOne: jest.fn(() => Promise.resolve(input.ride)) };
        }
        if (entity === RideCancellation) return cancellationRepository;
        if (entity === RideOffer) return { update: offerUpdate };
        if (entity === DriverOperationalState) {
          return {
            findOne: jest.fn(() => Promise.resolve(input.driverState ?? null)),
            save: driverStateSave,
          };
        }
        throw new Error('Repositorio inesperado en la prueba');
      }),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        (work: (entityManager: EntityManager) => Promise<unknown>) =>
          work(manager),
      ),
    } as unknown as DataSource;
    const transitionWithinTransaction = jest.fn(
      (
        _manager: EntityManager,
        ride: Ride,
        status: RideStatus,
      ): Promise<void> => {
        ride.status = status;
        ride.stateVersion += 1;
        return Promise.resolve();
      },
    );
    const restoreDriverAvailability = jest.fn(() => Promise.resolve());
    const transitionsService = {
      transitionWithinTransaction,
      restoreDriverAvailability,
    } as unknown as RideTransitionsService;
    const rideStartCodesService = {
      cancelForRideWithinTransaction: jest.fn(() => Promise.resolve()),
    } as unknown as RideStartCodesService;
    const realtimeService = {
      emitStatusChanged: jest.fn(),
      emitCancelled: jest.fn(),
    } as unknown as RideRealtimeService;
    const service = new RideCancellationsService(
      dataSource,
      new CancellationFeeCalculatorService(),
      transitionsService,
      rideStartCodesService,
      {} as RideDispatchService,
      realtimeService,
      {} as DriverAvailabilityRedisService,
    );

    return {
      service,
      offers,
      offerUpdate,
      driverStateSave,
      restoreDriverAvailability,
    };
  }

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

  describe('cancelByPassenger', () => {
    const cancelDto = {
      reason: PassengerCancellationReason.CHANGED_MIND,
    };

    it('cancela un viaje SEARCHING_DRIVER sin ofertas', async () => {
      const ride = createRide(RideStatus.SEARCHING_DRIVER);
      const harness = createPassengerCancellationHarness({ ride });

      const result = await harness.service.cancelByPassenger(
        passengerUserId,
        rideId,
        cancelDto,
      );

      expect(result.status).toBe(RideStatus.CANCELLED);
      expect(ride.status).toBe(RideStatus.CANCELLED);
      expect(harness.offers).toHaveLength(0);
    });

    it('cancela una oferta PROPOSED al cancelar el viaje', async () => {
      const ride = createRide(RideStatus.SEARCHING_DRIVER);
      const harness = createPassengerCancellationHarness({
        ride,
        offerStatuses: [RideOfferStatus.PROPOSED],
      });

      await harness.service.cancelByPassenger(
        passengerUserId,
        rideId,
        cancelDto,
      );

      expect(harness.offers[0]?.status).toBe(RideOfferStatus.CANCELLED);
      expect(harness.offers[0]?.respondedAt).toBeInstanceOf(Date);
      expect(harness.offers[0]?.cancelledAt).toBeInstanceOf(Date);
    });

    it('cancela todas las ofertas PROPOSED del viaje', async () => {
      const ride = createRide(RideStatus.SEARCHING_DRIVER);
      const harness = createPassengerCancellationHarness({
        ride,
        offerStatuses: [
          RideOfferStatus.PROPOSED,
          RideOfferStatus.PROPOSED,
          RideOfferStatus.PROPOSED,
        ],
      });

      await harness.service.cancelByPassenger(
        passengerUserId,
        rideId,
        cancelDto,
      );

      expect(
        harness.offers.every(
          (offer) => offer.status === RideOfferStatus.CANCELLED,
        ),
      ).toBe(true);
    });

    it('no deja ofertas activas y conserva intactos los estados terminales', async () => {
      const ride = createRide(RideStatus.SEARCHING_DRIVER);
      const harness = createPassengerCancellationHarness({
        ride,
        offerStatuses: [
          RideOfferStatus.OFFERED,
          RideOfferStatus.PROPOSED,
          RideOfferStatus.ACCEPTED,
          RideOfferStatus.REJECTED,
          RideOfferStatus.EXPIRED,
          RideOfferStatus.CANCELLED,
        ],
      });

      await harness.service.cancelByPassenger(
        passengerUserId,
        rideId,
        cancelDto,
      );

      expect(
        harness.offers.some(
          (offer) => offer.status === RideOfferStatus.PROPOSED,
        ),
      ).toBe(false);
      expect(harness.offers.map((offer) => offer.status)).toEqual([
        RideOfferStatus.CANCELLED,
        RideOfferStatus.CANCELLED,
        RideOfferStatus.CANCELLED,
        RideOfferStatus.REJECTED,
        RideOfferStatus.EXPIRED,
        RideOfferStatus.CANCELLED,
      ]);
    });

    it('rechaza un rideId inexistente', async () => {
      const harness = createPassengerCancellationHarness({ ride: null });

      await expect(
        harness.service.cancelByPassenger(passengerUserId, rideId, cancelDto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(harness.offerUpdate).not.toHaveBeenCalled();
    });

    it('oculta el viaje cuando pertenece a otro pasajero', async () => {
      const ride = createRide(RideStatus.SEARCHING_DRIVER, {
        passengerUserId: '3584621c-7781-4225-9b80-f7160197f1d2',
      });
      const harness = createPassengerCancellationHarness({ ride });

      await expect(
        harness.service.cancelByPassenger(passengerUserId, rideId, cancelDto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(harness.offerUpdate).not.toHaveBeenCalled();
    });

    it('rechaza un viaje que ya no admite cancelacion', async () => {
      const ride = createRide(RideStatus.CANCELLED);
      const harness = createPassengerCancellationHarness({ ride });

      await expect(
        harness.service.cancelByPassenger(passengerUserId, rideId, cancelDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(harness.offerUpdate).not.toHaveBeenCalled();
    });

    it('mantiene la liberacion del conductor y cancela la oferta ACCEPTED', async () => {
      const ride = createRide(RideStatus.DRIVER_ASSIGNED, {
        driverProfileId,
        driverAssignedAt: new Date(),
      });
      const driverState = Object.assign(new DriverOperationalState(), {
        driverProfileId,
        status: DriverOperationalStatus.BUSY,
        lastSeenAt: new Date(0),
        disconnectedAt: new Date(0),
      });
      const harness = createPassengerCancellationHarness({
        ride,
        offerStatuses: [RideOfferStatus.ACCEPTED],
        driverState,
      });

      await harness.service.cancelByPassenger(
        passengerUserId,
        rideId,
        cancelDto,
      );

      expect(driverState.status).toBe(DriverOperationalStatus.AVAILABLE);
      expect(driverState.disconnectedAt).toBeNull();
      expect(harness.driverStateSave).toHaveBeenCalledWith(driverState);
      expect(harness.restoreDriverAvailability).toHaveBeenCalledWith(
        driverProfileId,
      );
      expect(harness.offers[0]?.status).toBe(RideOfferStatus.CANCELLED);
    });
  });
});
