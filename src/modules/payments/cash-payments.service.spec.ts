import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import type { EnqueueOutboxEventInput } from '../outbox/interfaces/enqueue-outbox-event.interface';
import { OutboxService } from '../outbox/outbox.service';
import { RidePayment } from './entities/ride-payment.entity';
import { CashPaymentDisputeReason } from './enums/cash-payment-dispute-reason.enum';
import { CashPaymentResolution } from './enums/cash-payment-resolution.enum';
import { PaymentMethod } from './enums/payment-method.enum';
import { RidePaymentStatus } from './enums/ride-payment-status.enum';
import { CashPaymentsService } from './cash-payments.service';

const DRIVER_USER_ID = 'f544d52a-39e0-4da3-8861-6010355c5dba';
const DRIVER_PROFILE_ID = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
const PASSENGER_USER_ID = '2bb75614-f6d6-437f-b38f-e21aad622428';
const ADMIN_USER_ID = '9e14cab8-2714-4cf9-8024-c6c97c8729ca';
const RIDE_ID = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

function basePayment(status = RidePaymentStatus.PENDING): RidePayment {
  const now = new Date('2026-07-23T15:10:00.000Z');
  return Object.assign(new RidePayment(), {
    id: '0f73f001-dcd0-4b44-bf48-a2595c834cdf',
    rideId: RIDE_ID,
    passengerUserId: PASSENGER_USER_ID,
    driverProfileId: DRIVER_PROFILE_ID,
    method: PaymentMethod.CASH,
    status,
    amountDue: '8.50',
    cashReceived: null,
    changeGiven: null,
    currency: 'PEN',
    confirmedByDriverUserId: null,
    confirmedAt: null,
    confirmationNotes: null,
    disputeReason: null,
    disputeDetail: null,
    disputedAt: null,
    resolvedByAdminUserId: null,
    resolvedAt: null,
    resolutionNotes: null,
    createdAt: now,
    updatedAt: now,
  });
}

function driverProfile(): DriverProfile {
  return Object.assign(new DriverProfile(), {
    id: DRIVER_PROFILE_ID,
    userId: DRIVER_USER_ID,
    status: DriverStatus.APPROVED,
  });
}

function lockedDriverBuilder(profile: DriverProfile) {
  const builder = {
    where: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(() => Promise.resolve(profile)),
  };
  builder.where.mockReturnValue(builder);
  builder.setLock.mockReturnValue(builder);
  return builder;
}

function setup(payment: RidePayment) {
  const saved: RidePayment[] = [];
  const events: EnqueueOutboxEventInput[] = [];
  const save = jest.fn((value: RidePayment) => {
    saved.push(value);
    return Promise.resolve(value);
  });
  const paymentRepository = {
    findOne: jest.fn(() => Promise.resolve(payment)),
    save,
  };
  const profile = driverProfile();
  const profileRepository = {
    createQueryBuilder: jest.fn(() => lockedDriverBuilder(profile)),
    findOne: jest.fn(() => Promise.resolve(profile)),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown): unknown => {
      if (entity === RidePayment) return paymentRepository;
      if (entity === DriverProfile) return profileRepository;
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
      (_manager: EntityManager, input: EnqueueOutboxEventInput) => {
        events.push(input);
        return Promise.resolve(undefined);
      },
    ),
  } as unknown as OutboxService;
  return {
    service: new CashPaymentsService(dataSource, outbox),
    saved,
    events,
    save,
  };
}

describe('CashPaymentsService', () => {
  it('confirma efectivo, calcula el vuelto y publica el evento', async () => {
    const payment = basePayment();
    const fixture = setup(payment);

    const result = await fixture.service.confirmCash(DRIVER_USER_ID, RIDE_ID, {
      cashReceived: '10.00',
    });

    expect(result.status).toBe(RidePaymentStatus.PAID);
    expect(result.cashReceived).toBe('10.00');
    expect(result.changeGiven).toBe('1.50');
    expect(fixture.saved).toHaveLength(1);
    expect(fixture.events).toHaveLength(1);
    expect(fixture.events[0]?.eventType).toBe('CASH_PAYMENT_CONFIRMED');
  });

  it('rechaza efectivo menor que la tarifa final', async () => {
    const fixture = setup(basePayment());

    await expect(
      fixture.service.confirmCash(DRIVER_USER_ID, RIDE_ID, {
        cashReceived: '8.00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fixture.saved).toHaveLength(0);
    expect(fixture.events).toHaveLength(0);
  });

  it('es idempotente si el pago ya fue confirmado con el mismo importe', async () => {
    const payment = basePayment(RidePaymentStatus.PAID);
    payment.cashReceived = '10.00';
    payment.changeGiven = '1.50';
    const fixture = setup(payment);

    const result = await fixture.service.confirmCash(DRIVER_USER_ID, RIDE_ID, {
      cashReceived: '10.00',
    });

    expect(result.status).toBe(RidePaymentStatus.PAID);
    expect(fixture.saved).toHaveLength(0);
    expect(fixture.events).toHaveLength(0);
  });

  it('rechaza un segundo importe diferente para un pago confirmado', async () => {
    const payment = basePayment(RidePaymentStatus.PAID);
    payment.cashReceived = '10.00';
    const fixture = setup(payment);

    await expect(
      fixture.service.confirmCash(DRIVER_USER_ID, RIDE_ID, {
        cashReceived: '20.00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('permite al pasajero disputar un pago confirmado', async () => {
    const payment = basePayment(RidePaymentStatus.PAID);
    payment.cashReceived = '10.00';
    payment.changeGiven = '1.50';
    const fixture = setup(payment);

    const result = await fixture.service.disputeCash(
      PASSENGER_USER_ID,
      RIDE_ID,
      {
        reason: CashPaymentDisputeReason.CHANGE_NOT_RETURNED,
        detail: 'No recibí el vuelto',
      },
    );

    expect(result.status).toBe(RidePaymentStatus.DISPUTED);
    expect(result.disputeReason).toBe(
      CashPaymentDisputeReason.CHANGE_NOT_RETURNED,
    );
    expect(fixture.events[0]?.eventType).toBe('CASH_PAYMENT_DISPUTED');
  });

  it('permite al administrador anular un pago disputado', async () => {
    const payment = basePayment(RidePaymentStatus.DISPUTED);
    payment.disputeReason = CashPaymentDisputeReason.PAYMENT_NOT_MADE;
    payment.disputedAt = new Date();
    const fixture = setup(payment);

    const result = await fixture.service.resolveDispute(
      ADMIN_USER_ID,
      payment.id,
      {
        resolution: CashPaymentResolution.VOID_PAYMENT,
        notes: 'El pago no fue realizado',
      },
    );

    expect(result.status).toBe(RidePaymentStatus.VOIDED);
    expect(result.resolvedByAdminUserId).toBe(ADMIN_USER_ID);
    expect(fixture.events[0]?.eventType).toBe('CASH_PAYMENT_RESOLVED');
  });
});
