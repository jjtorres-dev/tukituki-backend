import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { RideDispatchService } from './ride-dispatch.service';
import { RideDispatchWorker } from './ride-dispatch.worker';

function createAvailabilityRedisServiceMock() {
  return {
    drainLateJoinPendingDrivers: jest.fn(() => Promise.resolve([])),
  } as unknown as DriverAvailabilityRedisService;
}

describe('RideDispatchWorker', () => {
  it('procesa viajes pendientes bajo advisory lock', async () => {
    const connect = jest.fn(() => Promise.resolve());
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ unlocked: true }]);
    const release = jest.fn(() => Promise.resolve());
    const queryRunner = { connect, query, release };
    const dataSourceQuery = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
      () => Promise.resolve([{ id: '1a50e0bf-8521-4a8c-b54c-44c52ef30213' }]),
    );
    const createQueryRunner = jest.fn(() => queryRunner);
    const dataSource = {
      query: dataSourceQuery,
      createQueryRunner,
    } as unknown as DataSource;
    const expirePendingOffers = jest.fn(() => Promise.resolve(0));
    const dispatchRide = jest.fn(() => Promise.resolve([]));
    const dispatchService = {
      expirePendingOffers,
      dispatchRide,
    } as unknown as RideDispatchService;
    const configService = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService;
    const worker = new RideDispatchWorker(
      configService,
      dataSource,
      dispatchService,
      createAvailabilityRedisServiceMock(),
    );

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(expirePendingOffers).toHaveBeenCalledTimes(1);
    expect(dispatchRide).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);

    /*
     * G3C-lite: findDueRides ya no debe limitar por dispatch_round —
     * una ride en radio máximo debe seguir siendo "due" mientras
     * pasen RIDE_DISPATCH_INTERVAL_MS desde last_dispatch_at.
     */
    const [sql] = dataSourceQuery.mock.calls[0];
    expect(sql).not.toMatch(/dispatch_round\s*</);
    expect(sql).toContain('last_dispatch_at');
  });

  it('drena la cola de late-join y despacha cada conductor', async () => {
    const configService = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService;
    const dataSource = {} as unknown as DataSource;
    const dispatchLateJoinDriver = jest.fn(() => Promise.resolve([]));
    const dispatchService = {
      dispatchLateJoinDriver,
    } as unknown as RideDispatchService;
    const drainLateJoinPendingDrivers = jest.fn(() =>
      Promise.resolve(['driver-1', 'driver-2']),
    );
    const availabilityRedisService = {
      drainLateJoinPendingDrivers,
    } as unknown as DriverAvailabilityRedisService;
    const worker = new RideDispatchWorker(
      configService,
      dataSource,
      dispatchService,
      availabilityRedisService,
    );

    await expect(worker.runLateJoinOnce()).resolves.toBe(2);
    expect(dispatchLateJoinDriver).toHaveBeenCalledWith('driver-1');
    expect(dispatchLateJoinDriver).toHaveBeenCalledWith('driver-2');
  });

  it('un conductor que falla no interrumpe el resto del lote de late-join', async () => {
    const configService = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService;
    const dataSource = {} as unknown as DataSource;
    const dispatchLateJoinDriver = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([]);
    const dispatchService = {
      dispatchLateJoinDriver,
    } as unknown as RideDispatchService;
    const availabilityRedisService = {
      drainLateJoinPendingDrivers: jest.fn(() =>
        Promise.resolve(['driver-1', 'driver-2']),
      ),
    } as unknown as DriverAvailabilityRedisService;
    const worker = new RideDispatchWorker(
      configService,
      dataSource,
      dispatchService,
      availabilityRedisService,
    );

    await expect(worker.runLateJoinOnce()).resolves.toBe(1);
    expect(dispatchLateJoinDriver).toHaveBeenCalledTimes(2);
  });
});
