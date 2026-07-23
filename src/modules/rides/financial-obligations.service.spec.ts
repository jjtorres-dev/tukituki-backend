import { DataSource } from 'typeorm';
import type { FindManyOptions } from 'typeorm';

import { FinancialObligationStatus } from './enums/financial-obligation-status.enum';
import { FinancialObligationType } from './enums/financial-obligation-type.enum';
import { UserFinancialObligation } from './entities/user-financial-obligation.entity';
import { FinancialObligationsService } from './financial-obligations.service';

describe('FinancialObligationsService', () => {
  it('lista únicamente las obligaciones del usuario autenticado', async () => {
    const userId = '93f39550-0847-451c-81ac-c2964cb4203f';
    const obligation = Object.assign(new UserFinancialObligation(), {
      id: '0323a724-6a36-4d59-8314-f0b624ac2a03',
      userId,
      rideId: '84a2529c-486a-42ce-b536-82cba39d79a2',
      obligationType: FinancialObligationType.PASSENGER_CANCELLATION_FEE,
      amount: '2.00',
      currency: 'PEN',
      status: FinancialObligationStatus.PENDING,
      resolvedAt: null,
      createdAt: new Date('2026-07-23T18:00:00.000Z'),
    });
    const findAndCount = jest.fn<
      Promise<[UserFinancialObligation[], number]>,
      [FindManyOptions<UserFinancialObligation>?]
    >(() => Promise.resolve([[obligation], 1]));
    const repository = { findAndCount };
    const dataSource = {
      getRepository: jest.fn(() => repository),
    } as unknown as DataSource;
    const service = new FinancialObligationsService(dataSource);

    const result = await service.list(userId, {
      page: 1,
      limit: 20,
      status: FinancialObligationStatus.PENDING,
    });

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, status: FinancialObligationStatus.PENDING },
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: obligation.id,
        amount: '2.00',
        status: FinancialObligationStatus.PENDING,
      }),
    ]);
    expect(result.pagination.totalItems).toBe(1);
  });
});
