import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { PassengerRidesService } from './passenger-rides.service';
import { RideDispatchService } from './ride-dispatch.service';
import { RideTransitionsService } from './ride-transitions.service';
import { RideViewService } from './ride-view.service';

describe('PassengerRidesService - passenger counter offers', () => {
  const passengerUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
  const offerId = '0847d580-6282-4a15-a967-95cb93650d36';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  function createContext() {
    const now = new Date();
    const ride = {
      id: rideId,
      passengerUserId,
      status: RideStatus.SEARCHING_DRIVER,
      estimatedFare: '5.00',
      passengerOfferFare: '5.50',
      currency: 'PEN',
      searchExpiresAt: new Date(now.getTime() + 120_000),
    } as Ride;
    const driverProfile = {
      id: driverProfileId,
      firstName: 'Carlos',
      lastName: 'Mendoza',
      photoUrl: null,
      ratingAverage: '4.92',
      ratingCount: 128,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const offer = {
      id: offerId,
      rideId,
      driverProfileId,
      status: RideOfferStatus.PROPOSED,
      distanceToOriginMeters: 320,
      proposedFare: '6.00',
      proposedAt: new Date(now.getTime() - 2_000),
      passengerProposedFare: null,
      passengerProposedAt: null,
      respondedAt: new Date(now.getTime() - 2_000),
      expiresAt: new Date(now.getTime() + 60_000),
      driverProfile,
    } as RideOffer;

    const rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
    };
    const offerRepository = {
      findOne: jest.fn(() => Promise.resolve(offer)),
      save: jest.fn((entity: RideOffer) => Promise.resolve(entity)),
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    const profileRepository = {
      findOne: jest.fn(() => Promise.resolve(driverProfile)),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) return rideRepository;
        if (entity === RideOffer) return offerRepository;
        if (entity === DriverProfile) return profileRepository;
        throw new Error('Repositorio inesperado');
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        <T>(work: (entityManager: EntityManager) => Promise<T>): Promise<T> =>
          work(manager as unknown as EntityManager),
      ),
    };
    const transitionsService = {
      expireWithinTransaction: jest.fn(() => Promise.resolve()),
    };
    const service = new PassengerRidesService(
      dataSource as unknown as DataSource,
      {} as RideDispatchService,
      transitionsService as unknown as RideTransitionsService,
      {} as RideViewService,
    );

    return {
      service,
      ride,
      offer,
    };
  }

  it('debe devolver el turno al conductor con un precio individual', async () => {
    const context = createContext();

    const result = await context.service.counterRideOffer(
      passengerUserId,
      rideId,
      offerId,
      {
        proposedFare: '5.75',
      },
    );

    expect(context.offer.status).toBe(RideOfferStatus.PASSENGER_COUNTERED);
    expect(context.offer.passengerProposedFare).toBe('5.75');
    expect(context.offer.passengerProposedAt).toBeInstanceOf(Date);
    expect(context.ride.passengerOfferFare).toBe('5.50');
    expect(result).toMatchObject({
      offerId,
      rideId,
      status: RideOfferStatus.PASSENGER_COUNTERED,
      initialPassengerOfferFare: '5.50',
      passengerOfferFare: '5.75',
      proposedFare: '6.00',
      isCounterOffer: true,
    });
  });

  it('debe exigir selección cuando el pasajero acepta el precio del conductor', async () => {
    const context = createContext();

    await expect(
      context.service.counterRideOffer(passengerUserId, rideId, offerId, {
        proposedFare: '6.00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(context.offer.status).toBe(RideOfferStatus.PROPOSED);
    expect(context.offer.passengerProposedFare).toBeNull();
  });

  it('debe impedir dos respuestas del pasajero en el mismo turno', async () => {
    const context = createContext();

    await context.service.counterRideOffer(passengerUserId, rideId, offerId, {
      proposedFare: '5.75',
    });

    await expect(
      context.service.counterRideOffer(passengerUserId, rideId, offerId, {
        proposedFare: '5.70',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
