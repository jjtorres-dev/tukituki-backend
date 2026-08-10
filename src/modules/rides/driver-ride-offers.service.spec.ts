import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { DriverRideOffersService } from './driver-ride-offers.service';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideDispatchService } from './ride-dispatch.service';
import { RideTransitionsService } from './ride-transitions.service';

function queryBuilderReturning<T>(value: T) {
  const builder = {
    where: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(() => Promise.resolve(value)),
  };

  builder.where.mockReturnValue(builder);
  builder.setLock.mockReturnValue(builder);

  return builder;
}

describe('DriverRideOffersService', () => {
  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';

  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

  const offerId = '0847d580-6282-4a15-a967-95cb93650d36';

  function createContext() {
    const profile = {
      id: driverProfileId,
      userId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;

    const state = {
      driverProfileId,
      status: DriverOperationalStatus.AVAILABLE,
      lastSeenAt: new Date(),
    } as DriverOperationalState;

    const ride = {
      id: rideId,
      passengerUserId: '2bb75614-f6d6-437f-b38f-e21aad622428',
      driverProfileId: null,
      status: RideStatus.SEARCHING_DRIVER,
      stateVersion: 0,

      originPosition: {
        type: 'Point',
        coordinates: [-76.3599, -6.4877],
      },

      destinationPosition: {
        type: 'Point',
        coordinates: [-76.3655, -6.4812],
      },

      originAddress: 'Jr. Lima 250, Tarapoto',

      destinationAddress: 'Plaza de Armas de Morales',

      estimatedFare: '5.00',
      passengerOfferFare: '7.00',
      agreedFare: null,

      currency: 'PEN',
      passengerNotes: null,

      searchExpiresAt: new Date(Date.now() + 240_000),

      driverAssignedAt: null,
    } as Ride;

    const offer = {
      id: offerId,
      rideId,
      driverProfileId,

      status: RideOfferStatus.OFFERED,

      distanceToOriginMeters: 420,
      dispatchRound: 1,
      searchRadiusMeters: 1000,

      offeredAt: new Date(),

      expiresAt: new Date(Date.now() + 60_000),

      proposedFare: null,
      proposedAt: null,

      respondedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      cancelledAt: null,
      rejectionReason: null,

      ride,
    } as RideOffer;

    const profileRepository = {
      createQueryBuilder: jest.fn(() => queryBuilderReturning(profile)),

      findOne: jest.fn(() => Promise.resolve(profile)),
    };

    const stateRepository = {
      findOne: jest.fn(() => Promise.resolve(state)),
    };

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

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) {
          return profileRepository;
        }

        if (entity === DriverOperationalState) {
          return stateRepository;
        }

        if (entity === Ride) {
          return rideRepository;
        }

        if (entity === RideOffer) {
          return offerRepository;
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
      dispatchRide: jest.fn(() => Promise.resolve([])),
    };

    const transitionsService = {
      expireWithinTransaction: jest.fn(() => Promise.resolve()),
    };

    const service = new DriverRideOffersService(
      dataSourceMock as unknown as DataSource,
      dispatchService as unknown as RideDispatchService,
      transitionsService as unknown as RideTransitionsService,
    );

    return {
      service,
      state,
      ride,
      offer,
    };
  }

  it('debe aceptar el precio del pasajero sin asignar todavía el viaje', async () => {
    const context = createContext();

    const result = await context.service.acceptOffer(userId, offerId);

    expect(result.status).toBe(RideOfferStatus.PROPOSED);

    expect(result.proposedFare).toBe('7.00');

    expect(context.offer.proposedAt).toBeInstanceOf(Date);

    expect(context.state.status).toBe(DriverOperationalStatus.AVAILABLE);

    expect(context.ride.status).toBe(RideStatus.SEARCHING_DRIVER);

    expect(context.ride.driverProfileId).toBeNull();

    expect(context.offer.expiresAt).toBe(context.ride.searchExpiresAt);
  });

  it.each(['6.00', '7.00', '8.00'])(
    'debe aceptar la contraoferta bidireccional %s sin asignar el viaje',
    async (proposedFare) => {
      const context = createContext();

      const result = await context.service.counterOffer(userId, offerId, {
        proposedFare,
      });

      expect(result.status).toBe(RideOfferStatus.PROPOSED);
      expect(result.proposedFare).toBe(proposedFare);
      expect(context.state.status).toBe(DriverOperationalStatus.AVAILABLE);
      expect(context.ride.status).toBe(RideStatus.SEARCHING_DRIVER);
      expect(context.ride.driverProfileId).toBeNull();
      expect(context.ride.agreedFare).toBeNull();
      expect(context.offer.expiresAt).toBe(context.ride.searchExpiresAt);
    },
  );

  it.each(['0', '10000', '7.000', 'NaN', 'Infinity'])(
    'debe mantener el rechazo del monto inválido %s',
    async (proposedFare) => {
      const context = createContext();

      await expect(
        context.service.counterOffer(userId, offerId, {
          proposedFare,
        }),
      ).rejects.toThrow('El precio propuesto no es válido');

      expect(context.offer.status).toBe(RideOfferStatus.OFFERED);
      expect(context.ride.driverProfileId).toBeNull();
      expect(context.state.status).toBe(DriverOperationalStatus.AVAILABLE);
    },
  );
});
