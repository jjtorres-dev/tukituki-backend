import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { RideLocationSample } from '../rides/entities/ride-location-sample.entity';
import { Ride } from '../rides/entities/ride.entity';
import { RideStatus } from '../rides/enums/ride-status.enum';
import { AdminRidesService } from './admin-rides.service';

function summaryBuilder(rawItems: unknown[], total: number) {
  const countBuilder = {
    getCount: jest.fn(() => Promise.resolve(total)),
  };
  const builder: Record<string, jest.Mock> = {
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    setParameter: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    offset: jest.fn(),
    limit: jest.fn(),
    clone: jest.fn(() => countBuilder),
    getRawMany: jest.fn(() => Promise.resolve(rawItems)),
  };
  for (const name of [
    'innerJoin',
    'leftJoin',
    'select',
    'addSelect',
    'setParameter',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
  ]) {
    builder[name].mockReturnValue(builder);
  }
  return builder;
}

describe('AdminRidesService', () => {
  it('lista viajes y transforma el resumen para el panel', async () => {
    const now = new Date('2026-07-23T18:00:00.000Z');
    const builder = summaryBuilder(
      [
        {
          id: '4aca7a5a-2b09-4af8-ae1b-6e572a6ca1dc',
          status: RideStatus.DRIVER_ASSIGNED,
          stateVersion: '2',
          passengerUserId: 'f635158b-4c68-460d-9df3-adfe8313d466',
          passengerPhoneE164: '+51911111111',
          passengerFirstName: 'Ana',
          passengerLastName: 'Ríos',
          passengerPhotoUrl: null,
          passengerRatingAverage: '4.80',
          driverProfileId: '7fc4248a-f9e8-4df0-929c-66805728474e',
          driverUserId: '3cdff993-f177-4323-bbee-e6c9d7c62a12',
          driverPhoneE164: '+51922222222',
          driverFirstName: 'Luis',
          driverLastName: 'Pérez',
          driverPhotoUrl: null,
          driverRatingAverage: '4.90',
          vehicleId: '5b1ace5f-c714-457f-8b7c-f6e617e0ff24',
          vehiclePlate: '1234-AB',
          vehicleBrand: 'Bajaj',
          vehicleModel: 'RE 4S',
          vehicleColor: 'Azul',
          vehicleType: 'MOTOTAXI',
          originZoneId: '43ecf6ef-f9f4-4bd1-886b-1b4a97f3a20a',
          originZoneCode: 'TARAPOTO',
          originZoneName: 'Tarapoto',
          destinationZoneId: '43ecf6ef-f9f4-4bd1-886b-1b4a97f3a20a',
          destinationZoneCode: 'TARAPOTO',
          destinationZoneName: 'Tarapoto',
          originLatitude: '-6.4877',
          originLongitude: '-76.3599',
          originAddress: 'Plaza de Armas',
          destinationLatitude: '-6.4810',
          destinationLongitude: '-76.3700',
          destinationAddress: 'Hospital',
          distanceMeters: '2500',
          estimatedDurationSeconds: '600',
          estimatedFare: '8.00',
          finalFare: null,
          currency: 'PEN',
          driverLatitude: '-6.4870',
          driverLongitude: '-76.3600',
          driverAccuracy: '8',
          driverHeading: '90',
          driverSpeed: '4.5',
          driverLocationRecordedAt: now,
          hasCancellation: false,
          openSafetyIncidentCount: '1',
          requestedAt: now,
          driverAssignedAt: now,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          updatedAt: now,
        },
      ],
      1,
    );
    const rideRepository = {
      createQueryBuilder: jest.fn(() => builder),
    };
    const dataSource = {
      getRepository: jest.fn(() => rideRepository),
    } as unknown as DataSource;
    const service = new AdminRidesService(dataSource);

    const result = await service.list({ page: 1, limit: 20 });

    expect(result.pagination.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      status: RideStatus.DRIVER_ASSIGNED,
      stateVersion: 2,
      passenger: { firstName: 'Ana' },
      driver: { firstName: 'Luis' },
      vehicle: { plate: '1234-AB', vehicleType: 'MOTOTAXI' },
      openSafetyIncidentCount: 1,
    });
    expect(result.items[0].currentDriverLocation?.latitude).toBe(-6.487);
  });

  it('aplica los estados activos en la vista operativa', async () => {
    const builder = summaryBuilder([], 0);
    const dataSource = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => builder),
      })),
    } as unknown as DataSource;
    const service = new AdminRidesService(dataSource);

    await service.list({ page: 1, limit: 20 }, true);

    expect(builder.andWhere).toHaveBeenCalledWith(
      'ride.status IN (:...activeRideStatuses)',
      {
        activeRideStatuses: [
          RideStatus.SEARCHING_DRIVER,
          RideStatus.DRIVER_ASSIGNED,
          RideStatus.DRIVER_ARRIVING,
          RideStatus.DRIVER_ARRIVED,
          RideStatus.IN_PROGRESS,
        ],
      },
    );
  });

  it('rechaza la cronología cuando el viaje no existe', async () => {
    const rideRepository = {
      existsBy: jest.fn(() => Promise.resolve(false)),
    };
    const dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Ride) return rideRepository;
        throw new Error('Repositorio inesperado');
      }),
    } as unknown as DataSource;
    const service = new AdminRidesService(dataSource);

    await expect(
      service.getTimeline('4aca7a5a-2b09-4af8-ae1b-6e572a6ca1dc'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pagina las muestras GPS del viaje', async () => {
    const now = new Date('2026-07-23T18:00:00.000Z');
    const location = Object.assign(new RideLocationSample(), {
      id: 'f0fa285f-30c2-48cd-a053-963e7fa9eab2',
      latitude: -6.4877,
      longitude: -76.3599,
      accuracy: 7,
      heading: 45,
      speed: 5,
      acceptedForMetrics: true,
      rejectionReason: null,
      distanceFromPreviousMeters: '10.00',
      cumulativeDistanceMeters: '250.00',
      recordedAt: now,
      receivedAt: now,
    });
    const locationBuilder: Record<string, jest.Mock> = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getManyAndCount: jest.fn(() => Promise.resolve([[location], 1])),
    };
    for (const name of [
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ]) {
      locationBuilder[name].mockReturnValue(locationBuilder);
    }
    const dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Ride) {
          return { existsBy: jest.fn(() => Promise.resolve(true)) };
        }
        if (entity === RideLocationSample) {
          return { createQueryBuilder: jest.fn(() => locationBuilder) };
        }
        throw new Error('Repositorio inesperado');
      }),
    } as unknown as DataSource;
    const service = new AdminRidesService(dataSource);

    const result = await service.getLocations(
      '4aca7a5a-2b09-4af8-ae1b-6e572a6ca1dc',
      { page: 1, limit: 50, acceptedForMetrics: true },
    );

    expect(result.pagination.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      latitude: -6.4877,
      acceptedForMetrics: true,
      cumulativeDistanceMeters: '250.00',
    });
  });
});
