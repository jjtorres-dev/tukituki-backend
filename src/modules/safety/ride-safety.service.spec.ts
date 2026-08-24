import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity';
import { OutboxService } from '../outbox/outbox.service';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { Ride } from '../rides/entities/ride.entity';
import { RideStatus } from '../rides/enums/ride-status.enum';
import { RideRealtimeService } from '../rides/realtime/ride-realtime.service';
import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { RideSafetyIncident } from './entities/ride-safety-incident.entity';
import { SafetyIncidentType } from './enums/safety-incident-type.enum';
import { RideSafetyService } from './ride-safety.service';

describe('RideSafetyService', () => {
  it('crea un incidente crítico y dos eventos outbox transaccionales', async () => {
    const reporterUserId = 'f6d87562-efca-4863-8cf8-b07f3ef0a17b';
    const ride = Object.assign(new Ride(), {
      id: '7e45cb8d-2dfa-4a41-9d0a-bd3981932637',
      passengerUserId: reporterUserId,
      driverProfileId: null,
      driverProfile: null,
      status: RideStatus.IN_PROGRESS,
      updatedAt: new Date(),
    });
    const rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
    };
    const passengerRepository = {
      findOne: jest.fn(() =>
        Promise.resolve(
          Object.assign(new PassengerProfile(), {
            userId: reporterUserId,
            firstName: 'Ana',
            lastName: 'Rojas',
            photoUrl: null,
          }),
        ),
      ),
    };
    const vehicleRepository = {
      findOne: jest.fn<Promise<DriverVehicle | null>, [unknown]>(() =>
        Promise.resolve(null),
      ),
    };
    const incidentRepository = {
      create: jest.fn<RideSafetyIncident, [Partial<RideSafetyIncident>]>(
        (input) => Object.assign(new RideSafetyIncident(), input),
      ),
      save: jest.fn<Promise<RideSafetyIncident>, [RideSafetyIncident]>(
        (incident) =>
          Promise.resolve(
            Object.assign(incident, {
              id: '2931c032-95d4-4f62-aa76-8532cb566cac',
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          ),
      ),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Ride) return rideRepository;
        if (entity === PassengerProfile) return passengerRepository;
        if (entity === DriverVehicle) return vehicleRepository;
        return incidentRepository;
      }),
      query: jest
        .fn<Promise<unknown>, [string, unknown[]]>()
        .mockResolvedValueOnce([{ distanceMeters: '10.50' }])
        .mockResolvedValueOnce([]),
    };
    const dataSource = {
      transaction: jest.fn(
        (callback: (value: typeof manager) => Promise<RideSafetyIncident>) =>
          callback(manager),
      ),
    } as unknown as DataSource;
    const configService = {
      get: jest.fn((_key: string, defaultValue: number) => defaultValue),
    } as unknown as ConfigService;
    const enqueueWithinTransaction = jest.fn<
      Promise<OutboxEvent>,
      [unknown, unknown]
    >(() => Promise.resolve(new OutboxEvent()));
    const outboxService = {
      enqueueWithinTransaction,
    } as unknown as OutboxService;
    const emitSafetyIncidentCreated = jest.fn();
    const realtimeService = {
      emitSafetyIncidentCreated,
    } as unknown as RideRealtimeService;
    const avatarResolver = {
      resolveDriverAvatarUrl: jest.fn(() => null),
      resolvePassengerAvatarUrl: jest.fn(() => null),
    } as unknown as AvatarUrlResolverService;
    const service = new RideSafetyService(
      dataSource,
      configService,
      outboxService,
      realtimeService,
      avatarResolver,
    );

    const result = await service.createIncident(reporterUserId, ride.id, {
      incidentType: SafetyIncidentType.THREAT,
      latitude: -6.4877,
      longitude: -76.3599,
      accuracy: 8,
      description: 'Necesito ayuda inmediata',
    });

    expect(result.severity).toBe('CRITICAL');
    expect(enqueueWithinTransaction).toHaveBeenCalledTimes(2);
    expect(emitSafetyIncidentCreated).toHaveBeenCalledTimes(1);
  });
});
