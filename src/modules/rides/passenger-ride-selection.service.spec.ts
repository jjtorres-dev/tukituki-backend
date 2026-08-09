import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { PassengerRideResponseDto } from './dto/passenger-ride-response.dto';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { PassengerRidesService } from './passenger-rides.service';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideDispatchService } from './ride-dispatch.service';
import { RideTransitionsService } from './ride-transitions.service';
import { RideViewService } from './ride-view.service';

describe('PassengerRidesService - ride selection', () => {
  const passengerUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

  const offerId = '0847d580-6282-4a15-a967-95cb93650d36';

  it('debe congelar el precio y asignar solamente al conductor elegido', async () => {
    const now = new Date();

    const ride = {
      id: rideId,
      passengerUserId,
      driverProfileId: null,
      status: RideStatus.SEARCHING_DRIVER,
      stateVersion: 0,
      passengerOfferFare: '5.50',
      agreedFare: null,
      searchExpiresAt: new Date(now.getTime() + 120_000),
    } as Ride;

    const offer = {
      id: offerId,
      rideId,
      driverProfileId,
      status: RideOfferStatus.PROPOSED,
      proposedFare: '6.00',
      proposedAt: new Date(now.getTime() - 5_000),
      expiresAt: new Date(now.getTime() + 60_000),
      respondedAt: new Date(now.getTime() - 5_000),
      acceptedAt: null,
      rejectedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    } as RideOffer;

    const profile = {
      id: driverProfileId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;

    const state = {
      driverProfileId,
      status: DriverOperationalStatus.AVAILABLE,
      lastSeenAt: now,
      disconnectedAt: null,
    } as DriverOperationalState;

    const rideRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(ride)
        .mockResolvedValueOnce(null),
    };

    const offerRepository = {
      findOne: jest.fn(() => Promise.resolve(offer)),

      save: jest.fn((entity: RideOffer) => Promise.resolve(entity)),

      update: jest.fn(() =>
        Promise.resolve({
          affected: 1,
        }),
      ),
    };

    const profileRepository = {
      findOne: jest.fn(() => Promise.resolve(profile)),
    };

    const stateRepository = {
      findOne: jest.fn(() => Promise.resolve(state)),

      save: jest.fn((entity: DriverOperationalState) =>
        Promise.resolve(entity),
      ),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) {
          return rideRepository;
        }

        if (entity === RideOffer) {
          return offerRepository;
        }

        if (entity === DriverProfile) {
          return profileRepository;
        }

        if (entity === DriverOperationalState) {
          return stateRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };

    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
    };

    const dispatchService = {
      dispatchRide: jest.fn(),
    };

    const transitionsService = {
      assignDriverSelectedByPassengerWithinTransaction: jest.fn(() => {
        ride.driverProfileId = driverProfileId;

        ride.status = RideStatus.DRIVER_ASSIGNED;

        ride.stateVersion = 1;

        ride.driverAssignedAt = new Date();

        return Promise.resolve();
      }),

      expireWithinTransaction: jest.fn(() => Promise.resolve()),
    };

    const passengerResponse = {
      id: rideId,
      driverProfileId,
      status: RideStatus.DRIVER_ASSIGNED,
      agreedFare: '6.00',
    } as PassengerRideResponseDto;

    const viewService = {
      toPassengerResponse: jest.fn(() => Promise.resolve(passengerResponse)),
    };

    const availabilityRedisService = {
      registerBusyPresence: jest.fn(() => Promise.resolve()),
    };

    const realtimeService = {
      emitAssigned: jest.fn(),

      emitStatusChanged: jest.fn(),
    };

    const service = new PassengerRidesService(
      dataSourceMock as unknown as DataSource,
      dispatchService as unknown as RideDispatchService,
      transitionsService as unknown as RideTransitionsService,
      viewService as unknown as RideViewService,
      undefined,
      undefined,
      undefined,
      undefined,
      availabilityRedisService as unknown as DriverAvailabilityRedisService,
      realtimeService as unknown as RideRealtimeService,
    );

    const result = await service.selectRideOffer(
      passengerUserId,
      rideId,
      offerId,
    );

    expect(ride.agreedFare).toBe('6.00');

    expect(offer.status).toBe(RideOfferStatus.ACCEPTED);

    expect(offer.acceptedAt).toBeInstanceOf(Date);

    expect(state.status).toBe(DriverOperationalStatus.BUSY);

    expect(
      transitionsService.assignDriverSelectedByPassengerWithinTransaction,
    ).toHaveBeenCalledWith(
      expect.anything(),
      ride,
      driverProfileId,
      passengerUserId,
      offerId,
      expect.any(Date),
    );

    expect(availabilityRedisService.registerBusyPresence).toHaveBeenCalledWith(
      driverProfileId,
    );

    expect(realtimeService.emitAssigned).toHaveBeenCalledWith(ride);

    expect(result.agreedFare).toBe('6.00');
  });
});
