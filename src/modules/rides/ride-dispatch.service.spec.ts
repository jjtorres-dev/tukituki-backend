import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverLocationsService } from '../driver-operations/driver-locations.service';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideDispatchService } from './ride-dispatch.service';
import { RIDE_OFFER_TTL_MS } from './ride-matching.constants';
import { RideTransitionsService } from './ride-transitions.service';

function createQueryBuilderMock<T>(rows: T[]) {
  const queryBuilder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    setLock: jest.fn(),
    innerJoin: jest.fn(),
    distinct: jest.fn(),
    getMany: jest.fn<Promise<T[]>, []>(() => Promise.resolve(rows)),
  };

  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  queryBuilder.orderBy.mockReturnValue(queryBuilder);
  queryBuilder.setLock.mockReturnValue(queryBuilder);
  queryBuilder.innerJoin.mockReturnValue(queryBuilder);
  queryBuilder.distinct.mockReturnValue(queryBuilder);

  return queryBuilder;
}

describe('RideDispatchService', () => {
  let service: RideDispatchService;
  let ride: Ride;
  let rideRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
  };
  let offerRepository: {
    update: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let driverLocationsService: {
    findNearbyAvailableDrivers: jest.Mock;
  };

  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  beforeEach(async () => {
    ride = {
      id: rideId,
      passengerUserId: 'f544d52a-39e0-4da3-8861-6010355c5dba',
      driverProfileId: null,
      status: RideStatus.SEARCHING_DRIVER,
      originPosition: {
        type: 'Point',
        coordinates: [-76.3599, -6.4877],
      },
      searchExpiresAt: new Date(Date.now() + 240_000),
      dispatchRound: 0,
      lastDispatchAt: null,
    } as Ride;

    rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
      find: jest.fn(() => Promise.resolve([])),
      save: jest.fn((entity: Ride) => Promise.resolve(entity)),
    };

    offerRepository = {
      update: jest.fn(() => Promise.resolve({ affected: 0 })),
      find: jest.fn(() => Promise.resolve([])),
      create: jest.fn((input: Partial<RideOffer>) => input as RideOffer),
      save: jest.fn((entities: RideOffer[]) => Promise.resolve(entities)),
    };

    const operationalState = {
      driverProfileId,
      status: DriverOperationalStatus.AVAILABLE,
    } as DriverOperationalState;
    const profile = {
      id: driverProfileId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const stateQueryBuilder = createQueryBuilderMock([operationalState]);
    const profileQueryBuilder = createQueryBuilderMock([profile]);
    const stateRepository = {
      createQueryBuilder: jest.fn(() => stateQueryBuilder),
    };
    const profileRepository = {
      createQueryBuilder: jest.fn(() => profileQueryBuilder),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) {
          return rideRepository;
        }

        if (entity === RideOffer) {
          return offerRepository;
        }

        if (entity === DriverOperationalState) {
          return stateRepository;
        }

        if (entity === DriverProfile) {
          return profileRepository;
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

    driverLocationsService = {
      findNearbyAvailableDrivers: jest.fn(() =>
        Promise.resolve([
          {
            driverProfileId,
            distanceMeters: 420.4,
          },
        ]),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RideDispatchService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: DriverLocationsService,
          useValue: driverLocationsService,
        },
        {
          provide: RideTransitionsService,
          useValue: {
            expireWithinTransaction: jest.fn(
              (_manager: EntityManager, entity: Ride) => {
                entity.status = RideStatus.EXPIRED;
                return Promise.resolve();
              },
            ),
          },
        },
      ],
    }).compile();

    service = module.get<RideDispatchService>(RideDispatchService);
  });

  it('debe buscar a un kilómetro y crear ofertas para conductores elegibles', async () => {
    const result = await service.dispatchRide(rideId);

    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).toHaveBeenCalledWith(-6.4877, -76.3599, 1000, 25);
    expect(result).toHaveLength(1);
    expect(result[0]?.driverProfileId).toBe(driverProfileId);
    expect(result[0]?.distanceToOriginMeters).toBe(420);
    expect(result[0]?.status).toBe(RideOfferStatus.OFFERED);
    expect(result[0].expiresAt.getTime() - result[0].offeredAt.getTime()).toBe(
      RIDE_OFFER_TTL_MS,
    );
    expect(ride.dispatchRound).toBe(1);
  });

  it('debe limitar expiresAt de la oferta al deadline global', async () => {
    ride.searchExpiresAt = new Date(Date.now() + 10_000);

    const result = await service.dispatchRide(rideId);

    expect(result).toHaveLength(1);
    expect(result[0]?.expiresAt).toEqual(ride.searchExpiresAt);
  });

  it('debe reutilizar ofertas vigentes sin volver a consultar Redis', async () => {
    const activeOffer = {
      id: '0847d580-6282-4a15-a967-95cb93650d36',
      rideId,
      driverProfileId,
      status: RideOfferStatus.OFFERED,
      expiresAt: new Date(Date.now() + 10_000),
    } as RideOffer;
    offerRepository.find.mockResolvedValueOnce([activeOffer]);

    const result = await service.dispatchRide(rideId);

    expect(result).toEqual([activeOffer]);
    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).not.toHaveBeenCalled();
  });

  it('debe avanzar la ronda aunque no encuentre candidatos', async () => {
    driverLocationsService.findNearbyAvailableDrivers.mockResolvedValue([]);

    const result = await service.dispatchRide(rideId);

    expect(result).toEqual([]);
    expect(ride.dispatchRound).toBe(1);
    expect(ride.lastDispatchAt).toBeInstanceOf(Date);
  });

  it('debe expirar un viaje cuya búsqueda terminó', async () => {
    ride.searchExpiresAt = new Date(Date.now() - 1000);

    const result = await service.dispatchRide(rideId);

    expect(result).toEqual([]);
    expect(ride.status).toBe(RideStatus.EXPIRED);
    expect(
      driverLocationsService.findNearbyAvailableDrivers,
    ).not.toHaveBeenCalled();
  });
});
