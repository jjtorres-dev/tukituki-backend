import { GoneException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { RideStartCode } from './entities/ride-start-code.entity';
import { Ride } from './entities/ride.entity';
import { RideStartCodeStatus } from './enums/ride-start-code-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideStartCodesService } from './ride-start-codes.service';

interface TestContext {
  service: RideStartCodesService;
  ride: Ride;
  getStartCode(): RideStartCode | null;
  setStartCode(value: RideStartCode | null): void;
}

function createContext(): TestContext {
  const ride = {
    id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
    passengerUserId: '2bb75614-f6d6-437f-b38f-e21aad622428',
    status: RideStatus.DRIVER_ARRIVED,
  } as Ride;
  let startCode: RideStartCode | null = null;

  const rideRepository = {
    findOne: jest.fn(() => Promise.resolve(ride)),
  };
  const startCodeRepository = {
    findOne: jest.fn(() => Promise.resolve(startCode)),
    create: jest.fn((input: Partial<RideStartCode>) => {
      startCode = {
        id: 'a8a4cf25-6402-45e0-a9a2-425ec572bd65',
        ...input,
      } as RideStartCode;
      return startCode;
    }),
    save: jest.fn((entity: RideStartCode) => {
      startCode = entity;
      return Promise.resolve(entity);
    }),
  };
  const managerMock = {
    getRepository: jest.fn((entity: unknown): unknown => {
      if (entity === Ride) return rideRepository;
      if (entity === RideStartCode) return startCodeRepository;
      throw new Error('Repositorio inesperado');
    }),
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
  const service = new RideStartCodesService(
    dataSourceMock as unknown as DataSource,
    configServiceMock as unknown as ConfigService,
  );

  return {
    service,
    ride,
    getStartCode: () => startCode,
    setStartCode: (value: RideStartCode | null) => {
      startCode = value;
    },
  };
}

describe('RideStartCodesService', () => {
  it('debe generar un código determinista de cuatro dígitos sin almacenarlo', async () => {
    const context = createContext();

    const response = await context.service.getPassengerStartCode(
      context.ride.passengerUserId,
      context.ride.id,
    );
    const stored = context.getStartCode();

    expect(response.code).toMatch(/^\d{4}$/);
    expect(response.code).toBe(
      context.service.deriveCode(stored as RideStartCode),
    );
    expect((stored as unknown as { code?: unknown }).code).toBeUndefined();
  });

  it('debe marcar como vencido y exigir regeneración', async () => {
    const context = createContext();
    context.setStartCode({
      id: 'a8a4cf25-6402-45e0-a9a2-425ec572bd65',
      rideId: context.ride.id,
      nonce: 'expired-nonce',
      status: RideStartCodeStatus.ACTIVE,
      failedAttempts: 0,
      maximumAttempts: 5,
      regenerationCount: 0,
      maximumRegenerations: 3,
      expiresAt: new Date(Date.now() - 1_000),
      usedAt: null,
      lockedAt: null,
      regeneratedAt: null,
      cancelledAt: null,
    } as RideStartCode);

    await expect(
      context.service.getPassengerStartCode(
        context.ride.passengerUserId,
        context.ride.id,
      ),
    ).rejects.toBeInstanceOf(GoneException);

    expect(context.getStartCode()?.status).toBe(RideStartCodeStatus.EXPIRED);
  });

  it('debe regenerar el nonce e invalidar el código anterior', async () => {
    const context = createContext();
    await context.service.getPassengerStartCode(
      context.ride.passengerUserId,
      context.ride.id,
    );
    const previous = context.getStartCode() as RideStartCode;
    const previousNonce = previous.nonce;
    const previousCode = context.service.deriveCode(previous);

    const response = await context.service.regeneratePassengerStartCode(
      context.ride.passengerUserId,
      context.ride.id,
    );
    const regenerated = context.getStartCode() as RideStartCode;

    expect(regenerated.nonce).not.toBe(previousNonce);
    expect(regenerated.regenerationCount).toBe(1);
    expect(response.code).toBe(context.service.deriveCode(regenerated));
    expect(response.code).not.toBe(previousCode);
  });

  it('debe impedir regeneraciones por encima del máximo', async () => {
    const context = createContext();
    context.setStartCode({
      id: 'a8a4cf25-6402-45e0-a9a2-425ec572bd65',
      rideId: context.ride.id,
      nonce: 'locked-nonce',
      status: RideStartCodeStatus.LOCKED,
      failedAttempts: 5,
      maximumAttempts: 5,
      regenerationCount: 3,
      maximumRegenerations: 3,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      lockedAt: new Date(),
      regeneratedAt: null,
      cancelledAt: null,
    } as RideStartCode);

    await expect(
      context.service.regeneratePassengerStartCode(
        context.ride.passengerUserId,
        context.ride.id,
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });
});
