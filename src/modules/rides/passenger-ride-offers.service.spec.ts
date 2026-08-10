import { DataSource } from 'typeorm';

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

describe('PassengerRidesService - ride offers', () => {
  const passengerUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

  const offerId = '0847d580-6282-4a15-a967-95cb93650d36';

  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  it('debe mostrar una contraoferta con datos públicos del conductor', async () => {
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
      photoUrl: 'https://example.com/carlos.jpg',
      ratingAverage: '4.92',
      ratingCount: 128,
      status: DriverStatus.APPROVED,
    } as DriverProfile;

    const proposedAt = new Date(now.getTime() - 2_000);

    const offer = {
      id: offerId,
      rideId,
      driverProfileId,
      status: RideOfferStatus.PROPOSED,
      distanceToOriginMeters: 320,
      proposedFare: '6.00',
      proposedAt,
      passengerProposedFare: null,
      passengerProposedAt: null,
      expiresAt: new Date(now.getTime() + 60_000),
      driverProfile,
    } as RideOffer;

    const rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
    };

    const offerRepository = {
      update: jest.fn(() =>
        Promise.resolve({
          affected: 0,
        }),
      ),

      find: jest.fn(() => Promise.resolve([offer])),
    };

    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) {
          return rideRepository;
        }

        if (entity === RideOffer) {
          return offerRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };

    const dispatchService = {
      dispatchRide: jest.fn(),
    };

    const transitionsService = {
      expireSearchingRide: jest.fn(() => Promise.resolve(true)),
    };

    const viewService = {
      toPassengerResponse: jest.fn(),
    };

    const service = new PassengerRidesService(
      dataSourceMock as unknown as DataSource,
      dispatchService as unknown as RideDispatchService,
      transitionsService as unknown as RideTransitionsService,
      viewService as unknown as RideViewService,
    );

    const result = await service.getRideOffers(passengerUserId, rideId);

    expect(result).toHaveLength(1);

    expect(result[0]).toMatchObject({
      offerId,
      rideId,

      driver: {
        profileId: driverProfileId,
        firstName: 'Carlos',
        lastNameInitial: 'M.',
        ratingAverage: '4.92',
        ratingCount: 128,
      },

      distanceToOriginMeters: 320,
      status: RideOfferStatus.PROPOSED,
      initialPassengerOfferFare: '5.50',
      passengerOfferFare: '5.50',
      proposedFare: '6.00',
      isCounterOffer: true,
      currency: 'PEN',
    });
  });
});
