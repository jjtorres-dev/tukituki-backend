import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { RideCommission } from '../commissions/entities/ride-commission.entity';
import { CommissionCollectionMode } from '../commissions/enums/commission-collection-mode.enum';
import { RideCommissionStatus } from '../commissions/enums/ride-commission-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import type { EnqueueOutboxEventInput } from '../outbox/interfaces/enqueue-outbox-event.interface';
import { OutboxService } from '../outbox/outbox.service';
import { DriverSettlementsService } from './driver-settlements.service';
import { DriverSettlementItem } from './entities/driver-settlement-item.entity';
import { DriverSettlement } from './entities/driver-settlement.entity';
import { SettlementDirection } from './enums/settlement-direction.enum';
import { SettlementStatus } from './enums/settlement-status.enum';

const DRIVER_PROFILE_ID = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
const DRIVER_USER_ID = 'f544d52a-39e0-4da3-8861-6010355c5dba';
const ADMIN_USER_ID = '9e14cab8-2714-4cf9-8024-c6c97c8729ca';
const SETTLEMENT_ID = '180e9971-69c7-4c0e-b550-0a92037dc040';
const PERIOD_START = '2026-07-01T00:00:00.000Z';
const PERIOD_END = '2026-07-20T00:00:00.000Z';

function commission(
  id: string,
  mode: CommissionCollectionMode,
): RideCommission {
  const digital = mode === CommissionCollectionMode.DEDUCT_FROM_PAYOUT;
  return Object.assign(new RideCommission(), {
    id,
    rideId: `${id.slice(0, -1)}1`,
    paymentId: `${id.slice(0, -1)}2`,
    driverProfileId: DRIVER_PROFILE_ID,
    policyId: null,
    paymentMethod: digital ? 'YAPE' : 'CASH',
    collectionMode: mode,
    status: RideCommissionStatus.ACCRUED,
    rateBps: 500,
    baseAmount: digital ? '100.00' : '40.00',
    commissionAmount: digital ? '5.00' : '2.00',
    driverNetAmount: digital ? '95.00' : '38.00',
    currency: 'PEN',
    accruedAt: new Date('2026-07-10T10:00:00.000Z'),
    eligibleAt: new Date('2026-07-11T10:00:00.000Z'),
    heldAt: null,
    settledAt: null,
    reversedAt: null,
  });
}

function commissions(): RideCommission[] {
  return [
    commission(
      '0f73f001-dcd0-4b44-bf48-a2595c834cd1',
      CommissionCollectionMode.DEDUCT_FROM_PAYOUT,
    ),
    commission(
      '0f73f001-dcd0-4b44-bf48-a2595c834cd2',
      CommissionCollectionMode.DRIVER_PAYABLE,
    ),
  ];
}

function settlement(status = SettlementStatus.DRAFT): DriverSettlement {
  return Object.assign(new DriverSettlement(), {
    id: SETTLEMENT_ID,
    driverProfileId: DRIVER_PROFILE_ID,
    idempotencyKey: 'settlement_key_123',
    periodStart: new Date(PERIOD_START),
    periodEnd: new Date(PERIOD_END),
    status,
    direction: SettlementDirection.PLATFORM_TO_DRIVER,
    currency: 'PEN',
    rideCount: 2,
    grossFareAmount: '140.00',
    platformCommissionAmount: '7.00',
    digitalNetAmount: '95.00',
    cashCommissionAmount: '2.00',
    settlementAmount: '93.00',
    createdByAdminUserId: ADMIN_USER_ID,
    approvedByAdminUserId:
      status === SettlementStatus.DRAFT ? null : ADMIN_USER_ID,
    settledByAdminUserId: null,
    cancelledByAdminUserId: null,
    transferReference: null,
    notes: null,
    approvedAt:
      status === SettlementStatus.DRAFT
        ? null
        : new Date('2026-07-21T10:00:00.000Z'),
    settledAt: null,
    cancelledAt: null,
    version: 1,
    createdAt: new Date('2026-07-21T09:00:00.000Z'),
    updatedAt: new Date('2026-07-21T09:00:00.000Z'),
  });
}

function items(source: RideCommission[]): DriverSettlementItem[] {
  return source.map((item, index) =>
    Object.assign(new DriverSettlementItem(), {
      id: `25b4cb7a-99b9-4db7-884c-96e04079c20${index}`,
      settlementId: SETTLEMENT_ID,
      commissionId: item.id,
      rideId: item.rideId,
      collectionMode: item.collectionMode,
      baseAmount: item.baseAmount,
      commissionAmount: item.commissionAmount,
      driverNetAmount: item.driverNetAmount,
      netEffectAmount:
        item.collectionMode === CommissionCollectionMode.DEDUCT_FROM_PAYOUT
          ? item.driverNetAmount
          : `-${item.commissionAmount}`,
      currency: item.currency,
      accruedAt: item.accruedAt,
      releasedAt: null,
      createdAt: new Date(),
    }),
  );
}

function setup(
  options: {
    currentSettlement?: DriverSettlement | null;
    currentCommissions?: RideCommission[];
    currentItems?: DriverSettlementItem[];
  } = {},
) {
  let currentSettlement = options.currentSettlement ?? null;
  const currentCommissions = options.currentCommissions ?? commissions();
  let currentItems = options.currentItems ?? [];
  const events: EnqueueOutboxEventInput[] = [];

  const commissionQueryBuilder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    setLock: jest.fn(),
    getMany: jest.fn(() => Promise.resolve(currentCommissions)),
  };
  for (const method of [
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'setLock',
  ] as const) {
    commissionQueryBuilder[method].mockReturnValue(commissionQueryBuilder);
  }

  const commissionRepository = {
    createQueryBuilder: jest.fn(() => commissionQueryBuilder),
    find: jest.fn(() => Promise.resolve(currentCommissions)),
    save: jest.fn((value: RideCommission[]) => Promise.resolve(value)),
  };
  const settlementRepository = {
    findOne: jest.fn(() => Promise.resolve(currentSettlement)),
    create: jest.fn((value: Partial<DriverSettlement>) =>
      Object.assign(new DriverSettlement(), value),
    ),
    save: jest.fn((value: DriverSettlement) => {
      if (!value.id) value.id = SETTLEMENT_ID;
      value.createdAt ??= new Date('2026-07-21T09:00:00.000Z');
      value.updatedAt = new Date('2026-07-21T09:00:00.000Z');
      currentSettlement = value;
      return Promise.resolve(value);
    }),
  };
  const itemRepository = {
    find: jest.fn(() => Promise.resolve(currentItems)),
    create: jest.fn((value: Partial<DriverSettlementItem>) =>
      Object.assign(new DriverSettlementItem(), value),
    ),
    save: jest.fn((value: DriverSettlementItem[]) => {
      currentItems = value.map((item, index) => {
        item.id ??= `25b4cb7a-99b9-4db7-884c-96e04079c20${index}`;
        item.createdAt ??= new Date();
        return item;
      });
      return Promise.resolve(currentItems);
    }),
  };
  const driver = Object.assign(new DriverProfile(), {
    id: DRIVER_PROFILE_ID,
    userId: DRIVER_USER_ID,
  });
  const driverRepository = {
    findOne: jest.fn(() => Promise.resolve(driver)),
  };
  const manager = {
    query: jest.fn(() => Promise.resolve([])),
    getRepository: jest.fn((entity: unknown): unknown => {
      if (entity === DriverSettlement) return settlementRepository;
      if (entity === DriverSettlementItem) return itemRepository;
      if (entity === RideCommission) return commissionRepository;
      if (entity === DriverProfile) return driverRepository;
      throw new Error('Repositorio inesperado');
    }),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(
      <T>(work: (entityManager: EntityManager) => Promise<T>): Promise<T> =>
        work(manager),
    ),
  } as unknown as DataSource;
  const outbox = {
    enqueueWithinTransaction: jest.fn(
      (_manager: EntityManager, event: EnqueueOutboxEventInput) => {
        events.push(event);
        return Promise.resolve(undefined);
      },
    ),
  } as unknown as OutboxService;
  return {
    service: new DriverSettlementsService(dataSource, outbox),
    manager,
    events,
    commissionQueryBuilder,
    settlementRepository,
    itemRepository,
    currentCommissions,
    get currentSettlement(): DriverSettlement | null {
      return currentSettlement;
    },
    get currentItems(): DriverSettlementItem[] {
      return currentItems;
    },
  };
}

describe('DriverSettlementsService', () => {
  it('nettea credito digital y deuda de efectivo en centimos', async () => {
    const fixture = setup();

    const result = await fixture.service.create(
      ADMIN_USER_ID,
      'settlement_key_123',
      {
        driverProfileId: DRIVER_PROFILE_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
    );

    expect(result.status).toBe(SettlementStatus.DRAFT);
    expect(result.direction).toBe(SettlementDirection.PLATFORM_TO_DRIVER);
    expect(result.grossFareAmount).toBe('140.00');
    expect(result.platformCommissionAmount).toBe('7.00');
    expect(result.digitalNetAmount).toBe('95.00');
    expect(result.cashCommissionAmount).toBe('2.00');
    expect(result.settlementAmount).toBe('93.00');
    expect(result.items).toHaveLength(2);
    expect(fixture.currentCommissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: RideCommissionStatus.ALLOCATED }),
      ]),
    );
  });

  it('calcula una deuda cuando el conductor debe mas comision en efectivo', async () => {
    const cashCommission = commission(
      '0f73f001-dcd0-4b44-bf48-a2595c834cd3',
      CommissionCollectionMode.DRIVER_PAYABLE,
    );
    const fixture = setup({ currentCommissions: [cashCommission] });

    const result = await fixture.service.create(
      ADMIN_USER_ID,
      'settlement_cash_debt',
      {
        driverProfileId: DRIVER_PROFILE_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
    );

    expect(result.direction).toBe(SettlementDirection.DRIVER_TO_PLATFORM);
    expect(result.digitalNetAmount).toBe('0.00');
    expect(result.cashCommissionAmount).toBe('2.00');
    expect(result.settlementAmount).toBe('2.00');
  });

  it('devuelve la misma liquidacion al repetir la clave idempotente', async () => {
    const current = settlement();
    const source = commissions();
    const fixture = setup({
      currentSettlement: current,
      currentCommissions: source,
      currentItems: items(source),
    });

    const result = await fixture.service.create(
      ADMIN_USER_ID,
      current.idempotencyKey,
      {
        driverProfileId: DRIVER_PROFILE_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
    );

    expect(result.id).toBe(SETTLEMENT_ID);
    expect(result.items).toHaveLength(2);
    expect(fixture.commissionQueryBuilder.getMany).not.toHaveBeenCalled();
  });

  it('aprueba y publica una liquidacion para el conductor', async () => {
    const fixture = setup({ currentSettlement: settlement() });

    const result = await fixture.service.approve(ADMIN_USER_ID, SETTLEMENT_ID, {
      notes: 'Revision financiera completada',
    });

    expect(result.status).toBe(SettlementStatus.APPROVED);
    expect(result.approvedByAdminUserId).toBe(ADMIN_USER_ID);
    expect(fixture.events[0]?.eventType).toBe('DRIVER_SETTLEMENT_APPROVED');
  });

  it('cierra una liquidacion aprobada y marca comisiones como liquidadas', async () => {
    const source = commissions();
    for (const item of source) item.status = RideCommissionStatus.ALLOCATED;
    const approved = settlement(SettlementStatus.APPROVED);
    const fixture = setup({
      currentSettlement: approved,
      currentCommissions: source,
      currentItems: items(source),
    });

    const result = await fixture.service.complete(
      ADMIN_USER_ID,
      SETTLEMENT_ID,
      { transferReference: 'BANK-2026-0001' },
    );

    expect(result.status).toBe(SettlementStatus.SETTLED);
    expect(result.transferReference).toBe('BANK-2026-0001');
    expect(
      fixture.currentCommissions.every(
        (item) =>
          item.status === RideCommissionStatus.SETTLED &&
          item.settledAt instanceof Date,
      ),
    ).toBe(true);
    expect(fixture.events[0]?.eventType).toBe('DRIVER_SETTLEMENT_SETTLED');
  });

  it('exige referencia financiera al cerrar una liquidacion no balanceada', async () => {
    const source = commissions();
    for (const item of source) item.status = RideCommissionStatus.ALLOCATED;
    const fixture = setup({
      currentSettlement: settlement(SettlementStatus.APPROVED),
      currentCommissions: source,
      currentItems: items(source),
    });

    await expect(
      fixture.service.complete(ADMIN_USER_ID, SETTLEMENT_ID, {}),
    ).rejects.toThrow('La referencia de transferencia o cobro es obligatoria');

    expect(
      fixture.currentCommissions.every(
        (item) => item.status === RideCommissionStatus.ALLOCATED,
      ),
    ).toBe(true);
  });

  it('cancela una liquidacion y libera sus comisiones sin borrar items', async () => {
    const source = commissions();
    for (const item of source) item.status = RideCommissionStatus.ALLOCATED;
    const fixture = setup({
      currentSettlement: settlement(SettlementStatus.APPROVED),
      currentCommissions: source,
      currentItems: items(source),
    });

    const result = await fixture.service.cancel(ADMIN_USER_ID, SETTLEMENT_ID, {
      reason: 'La transferencia requiere corregir los datos del conductor',
    });

    expect(result.status).toBe(SettlementStatus.CANCELLED);
    expect(
      fixture.currentCommissions.every(
        (item) => item.status === RideCommissionStatus.ACCRUED,
      ),
    ).toBe(true);
    expect(
      fixture.currentItems.every((item) => item.releasedAt instanceof Date),
    ).toBe(true);
    expect(fixture.events[0]?.eventType).toBe('DRIVER_SETTLEMENT_CANCELLED');
  });

  it('rechaza crear un borrador cuando no hay comisiones elegibles', async () => {
    const fixture = setup({ currentCommissions: [] });

    await expect(
      fixture.service.create(ADMIN_USER_ID, 'settlement_key_empty', {
        driverProfileId: DRIVER_PROFILE_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(fixture.currentSettlement).toBeNull();
  });
});
