import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { RideStartCode } from './entities/ride-start-code.entity';
import { Ride } from './entities/ride.entity';
import { RideStartCodeStatus } from './enums/ride-start-code-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideStartCodesService } from './ride-start-codes.service';
import { RideStartService } from './ride-start.service';
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

describe('RideStartService', () => {
  const driverUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

  let ride: Ride;
  let startCode: RideStartCode;
  let distanceMeters: number;
  let service: RideStartService;
  let codeService: RideStartCodesService;
  let transitionsService: {
    transitionWithinTransaction: jest.Mock;
  };
  let realtimeService: {
    emitStatusChanged: jest.Mock;
    emitStarted: jest.Mock;
  };

  beforeEach(() => {
    ride = {
      id: rideId,
      passengerUserId: '2bb75614-f6d6-437f-b38f-e21aad622428',
      driverProfileId,
      status: RideStatus.DRIVER_ARRIVED,
      stateVersion: 3,
      startedAt: null,
    } as Ride;
    startCode = {
      id: 'a8a4cf25-6402-45e0-a9a2-425ec572bd65',
      rideId,
      nonce: 'secure-test-nonce',
      status: RideStartCodeStatus.ACTIVE,
      failedAttempts: 0,
      maximumAttempts: 5,
      regenerationCount: 0,
      maximumRegenerations: 3,
      expiresAt: new Date(Date.now() + 900_000),
      usedAt: null,
      lockedAt: null,
      regeneratedAt: null,
      cancelledAt: null,
    } as RideStartCode;
    distanceMeters = 80;

    const profile = {
      id: driverProfileId,
      userId: driverUserId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const state = {
      driverProfileId,
      status: DriverOperationalStatus.BUSY,
    } as DriverOperationalState;
    const location = {
      driverProfileId,
      accuracy: 8,
      recordedAt: new Date(),
    } as DriverLocation;
    const rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
      save: jest.fn((entity: Ride) => Promise.resolve(entity)),
    };
    const profileRepository = {
      createQueryBuilder: jest.fn(() => queryBuilderReturning(profile)),
    };
    const stateRepository = {
      findOne: jest.fn(() => Promise.resolve(state)),
    };
    const startCodeRepository = {
      findOne: jest.fn(() => Promise.resolve(startCode)),
      save: jest.fn((entity: RideStartCode) => Promise.resolve(entity)),
    };
    const locationRepository = {
      findOne: jest.fn(() => Promise.resolve(location)),
    };
    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) return rideRepository;
        if (entity === DriverProfile) return profileRepository;
        if (entity === DriverOperationalState) return stateRepository;
        if (entity === RideStartCode) return startCodeRepository;
        if (entity === DriverLocation) return locationRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() =>
        Promise.resolve([{ distanceMeters: String(distanceMeters) }]),
      ),
    };
    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
    };
    const configValues: Record<string, string> = {
      RIDE_START_CODE_SECRET:
        'test-secret-with-more-than-thirty-two-characters-123456789',
      RIDE_START_CODE_TTL_SECONDS: '900',
      RIDE_START_CODE_MAX_ATTEMPTS: '5',
      RIDE_START_CODE_MAX_REGENERATIONS: '3',
    };
    const configServiceMock = {
      get: jest.fn((name: string): string | undefined => configValues[name]),
    };

    codeService = new RideStartCodesService(
      dataSourceMock as unknown as DataSource,
      configServiceMock as unknown as ConfigService,
    );
    transitionsService = {
      transitionWithinTransaction: jest.fn(
        (
          _manager: EntityManager,
          transitionRide: Ride,
          newStatus: RideStatus,
        ): Promise<void> => {
          transitionRide.status = newStatus;
          transitionRide.stateVersion += 1;
          return Promise.resolve();
        },
      ),
    };
    realtimeService = {
      emitStatusChanged: jest.fn(),
      emitStarted: jest.fn(),
    };
    service = new RideStartService(
      dataSourceMock as unknown as DataSource,
      codeService,
      transitionsService as unknown as RideTransitionsService,
      realtimeService as unknown as RideRealtimeService,
    );
  });

  it('debe iniciar el viaje con el código correcto', async () => {
    const code = codeService.deriveCode(startCode);

    const result = await service.startRide(driverUserId, rideId, code);

    expect(result.status).toBe(RideStatus.IN_PROGRESS);
    expect(result.stateVersion).toBe(4);
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(startCode.status).toBe(RideStartCodeStatus.USED);
    expect(startCode.usedAt).toBeInstanceOf(Date);
    expect(
      transitionsService.transitionWithinTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(realtimeService.emitStarted).toHaveBeenCalledTimes(1);
  });

  it('debe persistir el intento incorrecto antes de responder error', async () => {
    await expect(
      service.startRide(driverUserId, rideId, '9999'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(startCode.failedAttempts).toBe(1);
    expect(startCode.status).toBe(RideStartCodeStatus.ACTIVE);
    expect(
      transitionsService.transitionWithinTransaction,
    ).not.toHaveBeenCalled();
  });

  it('debe bloquear el código en el quinto intento incorrecto', async () => {
    startCode.failedAttempts = 4;

    const promise = service.startRide(driverUserId, rideId, '9999');

    await expect(promise).rejects.toHaveProperty('status', 423);
    expect(startCode.failedAttempts).toBe(5);
    expect(startCode.status).toBe(RideStartCodeStatus.LOCKED);
    expect(startCode.lockedAt).toBeInstanceOf(Date);
  });

  it('debe marcar como vencido antes de responder 410', async () => {
    startCode.expiresAt = new Date(Date.now() - 1_000);

    const promise = service.startRide(
      driverUserId,
      rideId,
      codeService.deriveCode(startCode),
    );

    await expect(promise).rejects.toHaveProperty('status', HttpStatus.GONE);
    expect(startCode.status).toBe(RideStartCodeStatus.EXPIRED);
  });

  it('debe rechazar el inicio lejos del origen', async () => {
    distanceMeters = 250;

    await expect(
      service.startRide(
        driverUserId,
        rideId,
        codeService.deriveCode(startCode),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(startCode.status).toBe(RideStartCodeStatus.ACTIVE);
  });
});
