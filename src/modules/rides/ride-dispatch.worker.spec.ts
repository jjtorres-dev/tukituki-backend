import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { RideDispatchService } from './ride-dispatch.service';
import { RideDispatchWorker } from './ride-dispatch.worker';

describe('RideDispatchWorker', () => {
  it('procesa viajes pendientes bajo advisory lock', async () => {
    const connect = jest.fn(() => Promise.resolve());
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ unlocked: true }]);
    const release = jest.fn(() => Promise.resolve());
    const queryRunner = { connect, query, release };
    const dataSourceQuery = jest.fn(() =>
      Promise.resolve([{ id: '1a50e0bf-8521-4a8c-b54c-44c52ef30213' }]),
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
    );

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(expirePendingOffers).toHaveBeenCalledTimes(1);
    expect(dispatchRide).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
