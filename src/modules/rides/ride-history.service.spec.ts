import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { VehicleType } from '../drivers/enums/vehicle-type.enum';
import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { RideStatus } from './enums/ride-status.enum';
import { RideHistoryService } from './ride-history.service';

const avatarResolverMock = {
  resolveDriverAvatarUrl: jest.fn(() => null),
  resolvePassengerAvatarUrl: jest.fn(() => null),
} as unknown as AvatarUrlResolverService;

describe('RideHistoryService', () => {
  it('debe devolver el historial paginado del pasajero', async () => {
    const requestedAt = new Date('2026-07-23T15:00:00.000Z');
    const query = jest
      .fn<Promise<unknown>, [string, unknown[]?]>()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        {
          rideId: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
          status: RideStatus.COMPLETED,
          originAddress: 'Jr. Lima 250, Tarapoto',
          destinationAddress: 'Plaza de Armas de Morales',
          requestedAt,
          startedAt: new Date('2026-07-23T15:05:00.000Z'),
          completedAt: new Date('2026-07-23T15:20:00.000Z'),
          cancelledAt: null,
          actualDistanceMeters: 3200,
          actualDurationSeconds: 900,
          estimatedFare: '7.40',
          finalFare: '7.80',
          currency: 'PEN',
          driverProfileId: '72b81eb5-c53f-4de2-bd9f-11f33d64da64',
          driverFirstName: 'Carlos',
          driverPhotoUrl: null,
          driverRatingAverage: '4.80',
          driverRatingCount: 25,
          vehiclePlate: '1234-AB',
          vehicleBrand: 'Bajaj',
          vehicleModel: 'RE 4S',
          vehicleColor: 'Rojo',
          vehicleType: VehicleType.MOTOTAXI,
          ratingSubmitted: false,
        },
      ]);
    const dataSource = { query };
    const service = new RideHistoryService(
      dataSource as unknown as DataSource,
      avatarResolverMock,
    );

    const result = await service.getPassengerHistory(
      'f544d52a-39e0-4da3-8861-6010355c5dba',
      { page: 1, limit: 20, status: RideStatus.COMPLETED },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.driver?.vehiclePlate).toBe('1234-AB');
    expect(result.items[0]?.canRate).toBe(true);
    expect(result.pagination.totalItems).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('debe devolver el historial del conductor', async () => {
    const profile = {
      id: '72b81eb5-c53f-4de2-bd9f-11f33d64da64',
      userId: '80ba55dd-aae8-42d4-93af-a1e30217cc79',
    } as DriverProfile;
    const query = jest
      .fn<Promise<unknown>, [string, unknown[]?]>()
      .mockResolvedValueOnce([{ total: '1' }])
      .mockResolvedValueOnce([
        {
          rideId: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
          status: RideStatus.COMPLETED,
          originAddress: 'Jr. Lima 250, Tarapoto',
          destinationAddress: 'Plaza de Armas de Morales',
          requestedAt: new Date('2026-07-23T15:00:00.000Z'),
          startedAt: new Date('2026-07-23T15:05:00.000Z'),
          completedAt: new Date('2026-07-23T15:20:00.000Z'),
          cancelledAt: null,
          actualDistanceMeters: '3200',
          actualDurationSeconds: '900',
          estimatedFare: '7.40',
          finalFare: '7.80',
          currency: 'PEN',
          passengerFirstName: 'Ana',
          passengerPhotoUrl: null,
          passengerRatingAverage: '4.90',
          passengerRatingCount: 12,
          ratingSubmitted: true,
        },
      ]);
    const dataSource = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(() => Promise.resolve(profile)),
      })),
      query,
    };
    const service = new RideHistoryService(
      dataSource as unknown as DataSource,
      avatarResolverMock,
    );

    const result = await service.getDriverHistory(profile.userId, {});

    expect(result.items[0]?.passenger?.firstName).toBe('Ana');
    expect(result.items[0]?.ratingSubmitted).toBe(true);
    expect(result.items[0]?.canRate).toBe(false);
  });

  it('debe rechazar un rango de fechas invertido', async () => {
    const service = new RideHistoryService(
      {} as DataSource,
      avatarResolverMock,
    );

    await expect(
      service.getPassengerHistory('passenger-id', {
        dateFrom: '2026-07-31',
        dateTo: '2026-07-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe responder 404 cuando el perfil de conductor no existe', async () => {
    const dataSource = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(() => Promise.resolve(null)),
      })),
    };
    const service = new RideHistoryService(
      dataSource as unknown as DataSource,
      avatarResolverMock,
    );

    await expect(
      service.getDriverHistory('driver-id', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
