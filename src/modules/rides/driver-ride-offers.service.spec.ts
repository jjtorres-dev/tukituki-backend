import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager, FindOneOptions } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
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

describe('DriverRideOffersService', () => {
  let service: DriverRideOffersService;
  let profileRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let stateRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let offerRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let rideRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let rideDispatchService: {
    dispatchRide: jest.Mock;
  };
  let availabilityRedisService: {
    registerBusyPresence: jest.Mock;
  };

  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
  const offerId = '0847d580-6282-4a15-a967-95cb93650d36';

  let profile: DriverProfile;
  let state: DriverOperationalState;
  let ride: Ride;
  let offer: RideOffer;

  beforeEach(async () => {
    profile = {
      id: driverProfileId,
      userId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    state = {
      driverProfileId,
      status: DriverOperationalStatus.AVAILABLE,
      connectedAt: new Date(),
      disconnectedAt: null,
      lastSeenAt: new Date(),
    } as DriverOperationalState;
    ride = {
      id: rideId,
      passengerUserId: 'a1c2f147-2324-4b48-986b-37c5cd2c6155',
      driverProfileId: null,
      status: RideStatus.SEARCHING_DRIVER,
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
      estimatedFare: '7.40',
      currency: 'PEN',
      passengerNotes: null,
      searchExpiresAt: new Date(Date.now() + 120_000),
      driverAssignedAt: null,
    } as Ride;
    offer = {
      id: offerId,
      rideId,
      driverProfileId,
      status: RideOfferStatus.OFFERED,
      distanceToOriginMeters: 420,
      dispatchRound: 1,
      searchRadiusMeters: 1000,
      offeredAt: new Date(),
      expiresAt: new Date(Date.now() + 15_000),
      respondedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      cancelledAt: null,
      rejectionReason: null,
      ride,
    } as RideOffer;

    const profileQueryBuilder = {
      where: jest.fn(),
      setLock: jest.fn(),
      getOne: jest.fn(() => Promise.resolve(profile)),
    };
    profileQueryBuilder.where.mockReturnValue(profileQueryBuilder);
    profileQueryBuilder.setLock.mockReturnValue(profileQueryBuilder);

    profileRepository = {
      findOne: jest.fn(() => Promise.resolve(profile)),
      createQueryBuilder: jest.fn(() => profileQueryBuilder),
    };
    stateRepository = {
      findOne: jest.fn(() => Promise.resolve(state)),
      save: jest.fn((entity: DriverOperationalState) =>
        Promise.resolve(entity),
      ),
    };
    offerRepository = {
      findOne: jest.fn(() => Promise.resolve(offer)),
      find: jest.fn(() => Promise.resolve([offer])),
      save: jest.fn((entity: RideOffer) => Promise.resolve(entity)),
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    rideRepository = {
      findOne: jest.fn((options: FindOneOptions<Ride>) => {
        const where = options.where as Record<string, unknown>;

        if ('id' in where) {
          return Promise.resolve(ride);
        }

        return Promise.resolve(null);
      }),
      save: jest.fn((entity: Ride) => Promise.resolve(entity)),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) {
          return profileRepository;
        }

        if (entity === DriverOperationalState) {
          return stateRepository;
        }

        if (entity === RideOffer) {
          return offerRepository;
        }

        if (entity === Ride) {
          return rideRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };
    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) {
          return profileRepository;
        }

        if (entity === DriverOperationalState) {
          return stateRepository;
        }

        if (entity === RideOffer) {
          return offerRepository;
        }

        throw new Error('Repositorio inesperado');
      }),
    };
    rideDispatchService = {
      dispatchRide: jest.fn(() => Promise.resolve([])),
    };
    availabilityRedisService = {
      registerBusyPresence: jest.fn(() => Promise.resolve()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverRideOffersService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: RideDispatchService,
          useValue: rideDispatchService,
        },
        {
          provide: DriverAvailabilityRedisService,
          useValue: availabilityRedisService,
        },
      ],
    }).compile();

    service = module.get<DriverRideOffersService>(DriverRideOffersService);
  });

  it('debe listar las ofertas vigentes del conductor disponible', async () => {
    const result = await service.getActiveOffers(userId);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(offerId);
    expect(result[0]?.ride.id).toBe(rideId);
  });

  it('debe impedir listar ofertas cuando el conductor no está AVAILABLE', async () => {
    stateRepository.findOne.mockResolvedValue({
      ...state,
      status: DriverOperationalStatus.OFFLINE,
    });

    await expect(service.getActiveOffers(userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('debe aceptar una oferta y asignar el viaje al conductor', async () => {
    const result = await service.acceptOffer(userId, offerId);

    expect(result.status).toBe(RideOfferStatus.ACCEPTED);
    expect(offer.status).toBe(RideOfferStatus.ACCEPTED);
    expect(ride.status).toBe(RideStatus.DRIVER_ASSIGNED);
    expect(ride.driverProfileId).toBe(driverProfileId);
    expect(state.status).toBe(DriverOperationalStatus.BUSY);
    expect(availabilityRedisService.registerBusyPresence).toHaveBeenCalledWith(
      driverProfileId,
    );
    expect(offerRepository.update).toHaveBeenCalledTimes(2);
  });

  it('debe rechazar una oferta y continuar el matching', async () => {
    const result = await service.rejectOffer(userId, offerId, {
      reason: 'Estoy terminando otra actividad',
    });

    expect(result.status).toBe(RideOfferStatus.REJECTED);
    expect(offer.rejectionReason).toBe('Estoy terminando otra actividad');
    expect(rideDispatchService.dispatchRide).toHaveBeenCalledWith(rideId);
  });

  it('debe impedir aceptar una oferta vencida', async () => {
    offer.expiresAt = new Date(Date.now() - 1000);

    await expect(service.acceptOffer(userId, offerId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(offer.status).toBe(RideOfferStatus.EXPIRED);
    expect(ride.status).toBe(RideStatus.SEARCHING_DRIVER);
  });

  it('debe impedir aceptar cuando otro conductor ya obtuvo el viaje', async () => {
    ride.status = RideStatus.DRIVER_ASSIGNED;
    ride.driverProfileId = 'e08592dc-b96b-4b03-a52c-2dafabecae75';

    await expect(service.acceptOffer(userId, offerId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(offer.status).toBe(RideOfferStatus.CANCELLED);
  });
});
