import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import type { EnqueueOutboxEventInput } from '../outbox/interfaces/enqueue-outbox-event.interface';
import { OutboxService } from '../outbox/outbox.service';
import { RidePayment } from '../payments/entities/ride-payment.entity';
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { RidePaymentStatus } from '../payments/enums/ride-payment-status.enum';
import { Ride } from '../rides/entities/ride.entity';
import { CommissionsService } from './commissions.service';
import { RideCommission } from './entities/ride-commission.entity';
import { CommissionCollectionMode } from './enums/commission-collection-mode.enum';
import { RideCommissionStatus } from './enums/ride-commission-status.enum';

const RIDE_ID = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
const PAYMENT_ID = '0f73f001-dcd0-4b44-bf48-a2595c834cdf';
const DRIVER_PROFILE_ID = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
const DRIVER_USER_ID = 'f544d52a-39e0-4da3-8861-6010355c5dba';
const POLICY_ID = '730069ed-7c8f-4d95-892b-b6c7cd52c6ea';

function payment(
  status = RidePaymentStatus.PAID,
  method = PaymentMethod.CASH,
): RidePayment {
  return Object.assign(new RidePayment(), {
    id: PAYMENT_ID,
    rideId: RIDE_ID,
    driverProfileId: DRIVER_PROFILE_ID,
    method,
    status,
    amountDue: '8.50',
    currency: 'PEN',
  });
}

function existingCommission(
  status = RideCommissionStatus.ACCRUED,
): RideCommission {
  return Object.assign(new RideCommission(), {
    id: '3b52562d-e8aa-4e38-92af-2f94b39d119a',
    rideId: RIDE_ID,
    paymentId: PAYMENT_ID,
    driverProfileId: DRIVER_PROFILE_ID,
    policyId: POLICY_ID,
    paymentMethod: PaymentMethod.CASH,
    collectionMode: CommissionCollectionMode.DRIVER_PAYABLE,
    status,
    rateBps: 500,
    baseAmount: '8.50',
    commissionAmount: '0.43',
    driverNetAmount: '8.07',
    currency: 'PEN',
    accruedAt: new Date('2026-07-24T10:00:00.000Z'),
    eligibleAt: new Date('2026-07-25T10:00:00.000Z'),
    heldAt: null,
    settledAt: null,
    reversedAt: null,
  });
}

function setup(initial: RideCommission | null = null) {
  let current = initial;
  const events: EnqueueOutboxEventInput[] = [];
  const commissionRepository = {
    findOne: jest.fn(() => Promise.resolve(current)),
    create: jest.fn((value: Partial<RideCommission>) =>
      Object.assign(new RideCommission(), value),
    ),
    save: jest.fn((value: RideCommission) => {
      if (!value.id) {
        value.id = '66f480db-3c1f-43a5-b846-9b82c6b0480a';
      }
      current = value;
      return Promise.resolve(value);
    }),
  };
  const rideRepository = {
    findOne: jest.fn(() =>
      Promise.resolve(
        Object.assign(new Ride(), {
          id: RIDE_ID,
          commissionPolicyId: POLICY_ID,
          platformCommissionRateBps: 500,
        }),
      ),
    ),
  };
  const driverRepository = {
    findOne: jest.fn(() =>
      Promise.resolve(
        Object.assign(new DriverProfile(), {
          id: DRIVER_PROFILE_ID,
          userId: DRIVER_USER_ID,
        }),
      ),
    ),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown): unknown => {
      if (entity === RideCommission) return commissionRepository;
      if (entity === Ride) return rideRepository;
      if (entity === DriverProfile) return driverRepository;
      throw new Error('Repositorio inesperado');
    }),
  } as unknown as EntityManager;
  const outbox = {
    enqueueWithinTransaction: jest.fn(
      (_manager: EntityManager, event: EnqueueOutboxEventInput) => {
        events.push(event);
        return Promise.resolve(undefined);
      },
    ),
  } as unknown as OutboxService;
  const service = new CommissionsService({} as DataSource, outbox);
  return {
    service,
    manager,
    events,
    commissionRepository,
    get current(): RideCommission | null {
      return current;
    },
  };
}

describe('CommissionsService', () => {
  it('devenga 5% para efectivo con redondeo half-up a centimos', async () => {
    const fixture = setup();
    const paid = payment();
    const accruedAt = new Date('2026-07-24T10:00:00.000Z');

    const result = await fixture.service.accrueWithinTransaction(
      fixture.manager,
      paid,
      accruedAt,
    );

    expect(result.rateBps).toBe(500);
    expect(result.baseAmount).toBe('8.50');
    expect(result.commissionAmount).toBe('0.43');
    expect(result.driverNetAmount).toBe('8.07');
    expect(result.eligibleAt).toEqual(new Date('2026-07-25T10:00:00.000Z'));
    expect(result.collectionMode).toBe(CommissionCollectionMode.DRIVER_PAYABLE);
    expect(fixture.events).toHaveLength(1);
    expect(fixture.events[0]?.eventType).toBe('PLATFORM_COMMISSION_ACCRUED');
  });

  it('descuenta la comision de la futura liquidacion digital', async () => {
    const fixture = setup();

    const result = await fixture.service.accrueWithinTransaction(
      fixture.manager,
      payment(RidePaymentStatus.PAID, PaymentMethod.YAPE),
      new Date(),
    );

    expect(result.paymentMethod).toBe(PaymentMethod.YAPE);
    expect(result.collectionMode).toBe(
      CommissionCollectionMode.DEDUCT_FROM_PAYOUT,
    );
  });

  it('es idempotente por pago y no publica un segundo evento', async () => {
    const existing = existingCommission();
    const fixture = setup(existing);

    const result = await fixture.service.accrueWithinTransaction(
      fixture.manager,
      payment(),
      new Date(),
    );

    expect(result).toBe(existing);
    expect(fixture.commissionRepository.save).not.toHaveBeenCalled();
    expect(fixture.events).toHaveLength(0);
  });

  it('rechaza devengar una comision antes de confirmar el pago', async () => {
    const fixture = setup();

    await expect(
      fixture.service.accrueWithinTransaction(
        fixture.manager,
        payment(RidePaymentStatus.PENDING),
        new Date(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('retiene una comision cuando el pasajero disputa el efectivo', async () => {
    const fixture = setup(existingCommission());
    const heldAt = new Date('2026-07-24T11:00:00.000Z');

    await fixture.service.holdWithinTransaction(
      fixture.manager,
      PAYMENT_ID,
      heldAt,
    );

    expect(fixture.current?.status).toBe(RideCommissionStatus.HELD);
    expect(fixture.current?.heldAt).toBe(heldAt);
  });

  it('rechaza una disputa cuando termino la ventana de 24 horas', async () => {
    const fixture = setup(existingCommission());

    await expect(
      fixture.service.holdWithinTransaction(
        fixture.manager,
        PAYMENT_ID,
        new Date('2026-07-25T10:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(fixture.current?.status).toBe(RideCommissionStatus.ACCRUED);
  });

  it('restaura la comision retenida si soporte confirma el pago', async () => {
    const commission = existingCommission(RideCommissionStatus.HELD);
    commission.heldAt = new Date();
    const fixture = setup(commission);

    await fixture.service.resolveDisputeWithinTransaction(
      fixture.manager,
      payment(),
      true,
      new Date(),
    );

    expect(fixture.current?.status).toBe(RideCommissionStatus.ACCRUED);
    expect(fixture.current?.heldAt).toBeNull();
  });

  it('revierte la comision si soporte anula el pago', async () => {
    const fixture = setup(existingCommission(RideCommissionStatus.HELD));
    const reversedAt = new Date('2026-07-24T12:00:00.000Z');

    await fixture.service.resolveDisputeWithinTransaction(
      fixture.manager,
      payment(RidePaymentStatus.VOIDED),
      false,
      reversedAt,
    );

    expect(fixture.current?.status).toBe(RideCommissionStatus.REVERSED);
    expect(fixture.current?.reversedAt).toBe(reversedAt);
  });
});
