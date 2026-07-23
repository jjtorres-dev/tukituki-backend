import { WsException } from '@nestjs/websockets';
import { DataSource } from 'typeorm';

import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { Ride } from '../entities/ride.entity';
import { RideRealtimeAccessService } from './ride-realtime-access.service';

describe('RideRealtimeAccessService', () => {
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
  const passengerUserId = '2bb75614-f6d6-437f-b38f-e21aad622428';
  const driverUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  const ride = {
    id: rideId,
    passengerUserId,
    driverProfileId,
  } as Ride;

  function createService(profile: DriverProfile | null) {
    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => ({
        findOne: jest.fn(() =>
          Promise.resolve(entity === Ride ? ride : profile),
        ),
      })),
    };

    return new RideRealtimeAccessService(
      dataSourceMock as unknown as DataSource,
    );
  }

  it('debe permitir al pasajero propietario unirse a la sala', async () => {
    const service = createService(null);
    const user = {
      id: passengerUserId,
      roles: [UserRole.PASSENGER],
    } as AuthenticatedUser;

    await expect(service.assertParticipant(user, rideId)).resolves.toBe(ride);
  });

  it('debe permitir al conductor asignado unirse a la sala', async () => {
    const service = createService({
      id: driverProfileId,
      userId: driverUserId,
    } as DriverProfile);
    const user = {
      id: driverUserId,
      roles: [UserRole.DRIVER],
    } as AuthenticatedUser;

    await expect(service.assertParticipant(user, rideId)).resolves.toBe(ride);
  });

  it('debe rechazar a un usuario ajeno al viaje', async () => {
    const service = createService(null);
    const user = {
      id: '346c651f-2a58-45e2-a7e7-028562b453ff',
      roles: [UserRole.PASSENGER],
    } as AuthenticatedUser;

    await expect(
      service.assertParticipant(user, rideId),
    ).rejects.toBeInstanceOf(WsException);
  });
});
