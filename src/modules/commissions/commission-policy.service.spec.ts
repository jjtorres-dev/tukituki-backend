import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { CommissionPolicyService } from './commission-policy.service';
import { CommissionPolicy } from './entities/commission-policy.entity';

const ADMIN_USER_ID = '9e14cab8-2714-4cf9-8024-c6c97c8729ca';
const POLICY_ID = '730069ed-7c8f-4d95-892b-b6c7cd52c6ea';

function policy(rateBps = 500): CommissionPolicy {
  return Object.assign(new CommissionPolicy(), {
    id: POLICY_ID,
    code: `TUKITUKI_DEFAULT_${rateBps}BPS`,
    name: `Comision TukiTuki ${(rateBps / 100).toFixed(2)}%`,
    rateBps,
    effectiveFrom: new Date('2026-07-24T10:00:00.000Z'),
    effectiveUntil: null,
    createdByAdminUserId: null,
    reason: 'Politica inicial de la plataforma',
  });
}

function setup(current: CommissionPolicy | null) {
  let nextId = 1;
  const saved: CommissionPolicy[] = [];
  const repository = {
    findOne: jest.fn(() => Promise.resolve(current)),
    create: jest.fn((value: Partial<CommissionPolicy>) =>
      Object.assign(new CommissionPolicy(), value, {
        id: `730069ed-7c8f-4d95-892b-b6c7cd52c6e${nextId++}`,
      }),
    ),
    save: jest.fn((value: CommissionPolicy) => {
      saved.push(value);
      return Promise.resolve(value);
    }),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown): unknown => {
      if (entity === CommissionPolicy) return repository;
      throw new Error('Repositorio inesperado');
    }),
    query: jest.fn(() => Promise.resolve([])),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(
      <T>(work: (entityManager: EntityManager) => Promise<T>): Promise<T> =>
        work(manager),
    ),
  } as unknown as DataSource;
  return {
    service: new CommissionPolicyService(dataSource),
    dataSource,
    manager,
    repository,
    saved,
  };
}

describe('CommissionPolicyService', () => {
  it('conserva 5% como politica inicial sin crear una version duplicada', async () => {
    const current = policy();
    const fixture = setup(current);

    const result = await fixture.service.replaceCurrent(ADMIN_USER_ID, {
      ratePercent: '5.00',
      reason: 'Mantener la politica vigente',
    });

    expect(result.ratePercent).toBe('5.00');
    expect(fixture.saved).toHaveLength(0);
  });

  it('versiona la politica al cambiar de 5% a 3%', async () => {
    const current = policy();
    const fixture = setup(current);

    const result = await fixture.service.replaceCurrent(ADMIN_USER_ID, {
      ratePercent: '3.00',
      reason: 'Campana temporal de captacion de conductores',
    });

    expect(current.effectiveUntil).toBeInstanceOf(Date);
    expect(fixture.saved).toHaveLength(2);
    expect(result.rateBps).toBe(300);
    expect(result.ratePercent).toBe('3.00');
    expect(result.reason).toBe('Campana temporal de captacion de conductores');
  });

  it('rechaza un motivo compuesto solamente por espacios', async () => {
    const fixture = setup(policy());

    await expect(
      fixture.service.replaceCurrent(ADMIN_USER_ID, {
        ratePercent: '4.00',
        reason: '             ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Jest mock assertion; the method is not invoked unbound.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza porcentajes fuera del rango aun sin pasar por el DTO', async () => {
    const fixture = setup(policy());

    await expect(
      fixture.service.replaceCurrent(ADMIN_USER_ID, {
        ratePercent: '5.01',
        reason: 'Intento de tasa fuera del rango permitido',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Jest mock assertion; the method is not invoked unbound.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('devuelve la tasa congelable desde la politica vigente', async () => {
    const current = policy(500);
    const fixture = setup(current);

    const snapshot = await fixture.service.getActiveSnapshot(
      fixture.manager,
      new Date('2026-07-24T12:00:00.000Z'),
    );

    expect(snapshot).toEqual({ policyId: POLICY_ID, rateBps: 500 });
  });
});
