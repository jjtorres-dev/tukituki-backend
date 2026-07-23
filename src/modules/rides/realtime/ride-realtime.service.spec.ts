import { DataSource } from 'typeorm';

import { DriverLocation } from '../../driver-operations/entities/driver-location.entity';
import { Ride } from '../entities/ride.entity';
import { RideStatus } from '../enums/ride-status.enum';
import { RideRealtimeService } from './ride-realtime.service';
import { RidesGateway } from './rides.gateway';

describe('RideRealtimeService', () => {
  it('debe emitir GPS únicamente cuando existe un viaje activo asignado', async () => {
    const ride = {
      id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
      driverProfileId: '72b81eb5-c53f-4de2-bd9f-11f33d64da64',
      status: RideStatus.DRIVER_ARRIVING,
    } as Ride;
    const location = {
      driverProfileId: ride.driverProfileId,
      latitude: -6.4879,
      longitude: -76.3601,
      heading: 90,
      speed: 7.5,
      accuracy: 8,
      recordedAt: new Date(),
    } as DriverLocation;
    const dataSourceMock = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(() => Promise.resolve(ride)),
      })),
    };
    const gateway = {
      emitToRide: jest.fn(),
    };
    const service = new RideRealtimeService(
      dataSourceMock as unknown as DataSource,
      gateway as unknown as RidesGateway,
    );

    await service.emitDriverLocation(ride.driverProfileId!, location);

    expect(gateway.emitToRide).toHaveBeenCalledWith(
      ride.id,
      'ride.driver-location.updated',
      expect.objectContaining({
        latitude: -6.4879,
        longitude: -76.3601,
      }),
    );
  });
});
