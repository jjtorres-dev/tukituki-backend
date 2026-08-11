import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { DriverDailyStatsService } from './driver-daily-stats.service';

describe('DriverDailyStatsService', () => {
  const userId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';

  function createContext(
    rows: Array<{
      currency: string;
      completedRides: string | number;
      grossAmount: string | number;
    }>,
    profileOverrides: Partial<DriverProfile> = {},
  ) {
    const profile = {
      id: driverProfileId,
      userId,
      status: DriverStatus.APPROVED,
      ...profileOverrides,
    } as DriverProfile;

    const profileRepository = {
      findOne: jest.fn(() => Promise.resolve(profile)),
    };

    const query = jest.fn(() => Promise.resolve(rows));

    const dataSourceMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === DriverProfile) {
          return profileRepository;
        }

        throw new Error('Repositorio inesperado');
      }),

      query,
    };

    const service = new DriverDailyStatsService(
      dataSourceMock as unknown as DataSource,
    );

    return { service, profile, profileRepository, query };
  }

  it('devuelve 0 viajes y 0.00 cuando no hay Rides COMPLETED (A)', async () => {
    const context = createContext([]);

    const result = await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T15:30:00.000Z'),
    );

    expect(result.completedRides).toBe(0);
    expect(result.grossAmount).toBe('0.00');
    expect(result.currency).toBe('PEN');
  });

  it('cuenta y suma un único Ride COMPLETED (B)', async () => {
    const context = createContext([
      { currency: 'PEN', completedRides: '1', grossAmount: '4.50' },
    ]);

    const result = await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T15:30:00.000Z'),
    );

    expect(result.completedRides).toBe(1);
    expect(result.grossAmount).toBe('4.50');
  });

  it('suma exacta con múltiples Rides COMPLETED y normaliza decimales (C)', async () => {
    const context = createContext([
      { currency: 'PEN', completedRides: 3, grossAmount: '18.5' },
    ]);

    const result = await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T15:30:00.000Z'),
    );

    expect(result.completedRides).toBe(3);
    expect(result.grossAmount).toBe('18.50');
  });

  it('la query filtra únicamente status = COMPLETED y no toca payments (D, I)', async () => {
    const context = createContext([]);

    await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T15:30:00.000Z'),
    );

    const [sql] = context.query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("status = 'COMPLETED'");
    expect(sql.toLowerCase()).not.toContain('payment');
    expect(sql.toLowerCase()).not.toContain('commission');
  });

  it('deriva el conductor exclusivamente del userId autenticado (E, N ownership)', async () => {
    const context = createContext([]);

    await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T15:30:00.000Z'),
    );

    const [findOneArg] = context.profileRepository.findOne.mock.calls[0] as [
      { where: { userId: string } },
    ];

    expect(findOneArg.where.userId).toBe(userId);

    const [, params] = context.query.mock.calls[0] as [string, unknown[]];

    expect(params[0]).toBe(driverProfileId);
  });

  it('incluye el límite inicial de America/Lima (F)', async () => {
    const context = createContext([]);

    await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T05:00:00.000Z'),
    );

    const [, params] = context.query.mock.calls[0] as [string, Date[]];

    expect(params[1].toISOString()).toBe('2026-08-10T05:00:00.000Z');
  });

  it('excluye el instante justo antes del límite inicial (G)', async () => {
    const context = createContext([]);

    await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T04:59:59.999Z'),
    );

    const [, params] = context.query.mock.calls[0] as [string, Date[]];

    expect(params[1].toISOString()).toBe('2026-08-09T05:00:00.000Z');
  });

  it('excluye el límite final (fin exclusivo) (H)', async () => {
    const context = createContext([]);

    await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T12:00:00.000Z'),
    );

    const [, params] = context.query.mock.calls[0] as [string, Date[]];

    expect(params[2].toISOString()).toBe('2026-08-11T05:00:00.000Z');
  });

  it('reporta la moneda de la fila agregada (J)', async () => {
    const context = createContext([
      { currency: 'PEN', completedRides: 2, grossAmount: '10.00' },
    ]);

    const result = await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T15:30:00.000Z'),
    );

    expect(result.currency).toBe('PEN');
  });

  it('nunca suma monedas distintas: usa la de plataforma y no mezcla montos', async () => {
    const context = createContext([
      { currency: 'PEN', completedRides: 2, grossAmount: '10.00' },
      { currency: 'USD', completedRides: 1, grossAmount: '5.00' },
    ]);

    const result = await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T15:30:00.000Z'),
    );

    expect(result.currency).toBe('PEN');
    expect(result.completedRides).toBe(2);
    expect(result.grossAmount).toBe('10.00');
  });

  it('calcula businessDate correctamente para el "ahora" inyectado (K)', async () => {
    const context = createContext([]);

    const result = await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T15:30:00.000Z'),
    );

    expect(result.businessDate).toBe('2026-08-10');
  });

  it('reporta siempre timezone America/Lima (L)', async () => {
    const context = createContext([]);

    const result = await context.service.getDailyStats(
      userId,
      new Date('2026-08-10T15:30:00.000Z'),
    );

    expect(result.timezone).toBe('America/Lima');
  });

  it('asOf coincide exactamente con el reloj inyectado (M)', async () => {
    const context = createContext([]);

    const now = new Date('2026-08-10T15:30:00.000Z');

    const result = await context.service.getDailyStats(userId, now);

    expect(result.asOf).toBe(now);
  });

  it('lanza NotFoundException si el usuario DRIVER no tiene profile', async () => {
    const dataSourceMock = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(() => Promise.resolve(null)),
      })),
      query: jest.fn(),
    };

    const service = new DriverDailyStatsService(
      dataSourceMock as unknown as DataSource,
    );

    await expect(service.getDailyStats(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lanza ForbiddenException si el profile no está APPROVED', async () => {
    const context = createContext([], { status: DriverStatus.PENDING_REVIEW });

    await expect(
      context.service.getDailyStats(userId, new Date()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
