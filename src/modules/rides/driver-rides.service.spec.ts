import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { DriverRidesService } from './driver-rides.service';
import { DriverActiveRideResponseDto } from './dto/driver-active-ride-response.dto';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { RideViewService } from './ride-view.service';

describe('DriverRidesService', () => {
  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

  it('debe devolver únicamente el viaje asignado al conductor', async () => {
    const profile = {
      id: driverProfileId,
      userId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const ride = {
      id: rideId,
      driverProfileId,
      status: RideStatus.DRIVER_ARRIVING,
    } as Ride;
    const location = {
      driverProfileId,
    } as DriverLocation;
    const profileRepository = {
      findOne: jest.fn(() => Promise.resolve(profile)),
    };
    const rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
    };
    const locationRepository = {
      findOne: jest.fn(() => Promise.resolve(location)),
    };
    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) return profileRepository;
        if (entity === Ride) return rideRepository;
        if (entity === DriverLocation) return locationRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() => Promise.resolve([{ distanceMeters: '85.4' }])),
    };
    const viewService = {
      toDriverResponse: jest.fn(
        (entity: Ride, distance: number | null) =>
          ({
            id: entity.id,
            status: entity.status,
            distanceToOriginMeters: distance,
          }) as DriverActiveRideResponseDto,
      ),
    };
    const service = new DriverRidesService(
      dataSourceMock as unknown as DataSource,
      viewService as unknown as RideViewService,
    );

    const result = await service.getActiveRide(userId);

    expect(result.id).toBe(rideId);
    expect(result.distanceToOriginMeters).toBe(85);
  });

  it('debe ocultar un viaje que no pertenece al conductor', async () => {
    const profile = {
      id: driverProfileId,
      userId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => ({
        findOne: jest.fn(() =>
          Promise.resolve(entity === DriverProfile ? profile : null),
        ),
      })),
    };
    const service = new DriverRidesService(
      dataSourceMock as unknown as DataSource,
      {} as RideViewService,
    );

    await expect(service.getRide(userId, rideId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
