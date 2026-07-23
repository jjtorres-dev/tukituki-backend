import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';

import { CancellationPolicy } from './entities/cancellation-policy.entity';
import { CancellationPolicyService } from './cancellation-policy.service';

type PolicyQueryBuilderMock = {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  setLock: jest.Mock;
  getOne: jest.Mock<Promise<CancellationPolicy | null>, []>;
};

function createPolicyQueryBuilder(
  policy: CancellationPolicy | null,
): PolicyQueryBuilderMock {
  const queryBuilder = {} as PolicyQueryBuilderMock;
  queryBuilder.where = jest.fn(() => queryBuilder);
  queryBuilder.andWhere = jest.fn(() => queryBuilder);
  queryBuilder.orderBy = jest.fn(() => queryBuilder);
  queryBuilder.addOrderBy = jest.fn(() => queryBuilder);
  queryBuilder.setLock = jest.fn(() => queryBuilder);
  queryBuilder.getOne = jest.fn(() => Promise.resolve(policy));
  return queryBuilder;
}

describe('CancellationPolicyService', () => {
  const configValues: Record<string, string | number> = {
    PASSENGER_CANCELLATION_GRACE_SECONDS: 75,
    CANCELLATION_FEE_ASSIGNED_PEN: '1.20',
    CANCELLATION_FEE_ARRIVING_PEN: '1.70',
    CANCELLATION_FEE_ARRIVED_PEN: '2.20',
    PASSENGER_NO_SHOW_FEE_PEN: '2.80',
    DRIVER_NO_SHOW_COMPENSATION_PEN: '1.60',
    PASSENGER_NO_SHOW_WAIT_SECONDS: 360,
    DRIVER_NO_PROGRESS_SECONDS: 210,
    DRIVER_NO_PROGRESS_MIN_METERS: 120,
  };
  const configService = {
    get: jest.fn(
      (key: string, fallback: string | number) => configValues[key] ?? fallback,
    ),
  } as unknown as ConfigService;

  it('crea el snapshot desde la política persistente vigente', async () => {
    const policy = Object.assign(new CancellationPolicy(), {
      id: 'ead55e6d-a134-4710-a86f-6c07c1eef50f',
      passengerGracePeriodSeconds: 60,
      passengerAssignedFee: '1.00',
      passengerArrivingFee: '1.50',
      passengerArrivedFee: '2.00',
      passengerNoShowFee: '2.50',
      driverNoShowCompensation: '1.50',
      driverArrivalWaitSeconds: 300,
      driverNoProgressSeconds: 180,
      driverNoProgressMinMeters: 100,
      currency: 'PEN',
    });
    const queryBuilder = createPolicyQueryBuilder(policy);
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => queryBuilder),
      })),
    } as unknown as EntityManager;
    const service = new CancellationPolicyService(configService);

    await expect(
      service.getActiveSnapshot(manager, new Date('2026-07-23T18:00:00.000Z')),
    ).resolves.toEqual({
      policyId: policy.id,
      gracePeriodSeconds: 60,
      assignedFee: '1.00',
      arrivingFee: '1.50',
      arrivedFee: '2.00',
      passengerNoShowFee: '2.50',
      driverNoShowCompensation: '1.50',
      driverArrivalWaitSeconds: 300,
      driverNoProgressSeconds: 180,
      driverNoProgressMinMeters: 100,
      currency: 'PEN',
    });
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_read');
  });

  it('usa la configuración como respaldo cuando no existe una política activa', async () => {
    const queryBuilder = createPolicyQueryBuilder(null);
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => queryBuilder),
      })),
    } as unknown as EntityManager;
    const service = new CancellationPolicyService(configService);

    await expect(
      service.getActiveSnapshot(manager, new Date('2026-07-23T18:00:00.000Z')),
    ).resolves.toEqual({
      policyId: null,
      gracePeriodSeconds: 75,
      assignedFee: '1.20',
      arrivingFee: '1.70',
      arrivedFee: '2.20',
      passengerNoShowFee: '2.80',
      driverNoShowCompensation: '1.60',
      driverArrivalWaitSeconds: 360,
      driverNoProgressSeconds: 210,
      driverNoProgressMinMeters: 120,
      currency: 'PEN',
    });
  });
});
