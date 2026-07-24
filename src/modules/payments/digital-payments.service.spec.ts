import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import type { EnqueueOutboxEventInput } from '../outbox/interfaces/enqueue-outbox-event.interface';
import { OutboxService } from '../outbox/outbox.service';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { User } from '../users/entities/user.entity';
import { DigitalPaymentAttempt } from './entities/digital-payment-attempt.entity';
import { RidePayment } from './entities/ride-payment.entity';
import { DigitalPaymentAttemptStatus } from './enums/digital-payment-attempt-status.enum';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentProvider } from './enums/payment-provider.enum';
import { RidePaymentStatus } from './enums/ride-payment-status.enum';
import type { PaymentGateway } from './gateways/payment-gateway.interface';
import { createIzipaySignature } from './utils/izipay-signature.util';
import { DigitalPaymentsService } from './digital-payments.service';

const PASSENGER_USER_ID = '2bb75614-f6d6-437f-b38f-e21aad622428';
const DRIVER_USER_ID = 'f544d52a-39e0-4da3-8861-6010355c5dba';
const DRIVER_PROFILE_ID = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
const RIDE_ID = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';
const PAYMENT_ID = '0f73f001-dcd0-4b44-bf48-a2595c834cdf';
const ATTEMPT_ID = '4cf0be21-c71e-4398-a009-977663da43a2';
const TRANSACTION_ID = '75ccdc41f33b4641b1a490664f61533f';
const ORDER_NUMBER = 'TTORDER123';
const KEY_HASH = 'sandbox-key-hash-with-enough-entropy';

function payment(
  status = RidePaymentStatus.PENDING,
  method = PaymentMethod.YAPE,
): RidePayment {
  return Object.assign(new RidePayment(), {
    id: PAYMENT_ID,
    rideId: RIDE_ID,
    passengerUserId: PASSENGER_USER_ID,
    driverProfileId: DRIVER_PROFILE_ID,
    method,
    status,
    amountDue: '8.50',
    currency: 'PEN',
  });
}

function attempt(
  status = DigitalPaymentAttemptStatus.PENDING,
): DigitalPaymentAttempt {
  return Object.assign(new DigitalPaymentAttempt(), {
    id: ATTEMPT_ID,
    paymentId: PAYMENT_ID,
    provider: PaymentProvider.IZIPAY,
    method: PaymentMethod.YAPE,
    status,
    idempotencyKey: 'checkout_key_123',
    transactionId: TRANSACTION_ID,
    orderNumber: ORDER_NUMBER,
    amount: '8.50',
    currency: 'PEN',
    sessionExpiresAt: new Date(Date.now() + 900_000),
    providerAuthorizationCode: null,
    providerReferenceNumber: null,
    providerUniqueId: null,
    providerStateMessage: null,
    failureCode: null,
    failureMessage: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function configService(): ConfigService {
  return {
    get: jest.fn((key: string) =>
      key === 'IZIPAY_KEY_HASH' ? KEY_HASH : undefined,
    ),
  } as unknown as ConfigService;
}

function checkoutFixture() {
  const currentPayment = payment();
  const currentAttempt = attempt(DigitalPaymentAttemptStatus.CREATED);
  let attemptExists = false;
  const attemptRepository = {
    findOne: jest.fn((options: { where: Record<string, unknown> }) => {
      if ('id' in options.where) return Promise.resolve(currentAttempt);
      if ('paymentId' in options.where && 'idempotencyKey' in options.where) {
        return Promise.resolve(attemptExists ? currentAttempt : null);
      }
      return Promise.resolve(null);
    }),
    create: jest.fn((value: Partial<DigitalPaymentAttempt>) => {
      Object.assign(currentAttempt, value, { id: ATTEMPT_ID });
      return currentAttempt;
    }),
    save: jest.fn((value: DigitalPaymentAttempt) => {
      attemptExists = true;
      Object.assign(currentAttempt, value);
      return Promise.resolve(currentAttempt);
    }),
  };
  const paymentRepository = {
    findOne: jest.fn(() => Promise.resolve(currentPayment)),
    save: jest.fn((value: RidePayment) => Promise.resolve(value)),
  };
  const passenger = Object.assign(new PassengerProfile(), {
    userId: PASSENGER_USER_ID,
    firstName: 'Juan',
    lastName: 'Pérez',
    user: Object.assign(new User(), { phoneE164: '+51987654321' }),
  });
  const profileRepository = {
    findOne: jest.fn(() => Promise.resolve(passenger)),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown): unknown => {
      if (entity === RidePayment) return paymentRepository;
      if (entity === DigitalPaymentAttempt) return attemptRepository;
      throw new Error('Repositorio inesperado');
    }),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(
      <T>(work: (entityManager: EntityManager) => Promise<T>): Promise<T> =>
        work(manager),
    ),
    getRepository: jest.fn((entity: unknown): unknown => {
      if (entity === PassengerProfile) return profileRepository;
      throw new Error('Repositorio inesperado');
    }),
  } as unknown as DataSource;
  const expiresAt = new Date(Date.now() + 900_000);
  const gateway = {
    createCheckoutSession: jest.fn(() =>
      Promise.resolve({
        provider: PaymentProvider.IZIPAY,
        authorization: 'session-token',
        publicKey: 'public-key',
        checkoutScriptUrl: 'https://sandbox-checkout.izipay.pe/index.js',
        checkoutConfig: { transactionId: TRANSACTION_ID },
        expiresAt,
      }),
    ),
  } as unknown as PaymentGateway;
  const service = new DigitalPaymentsService(
    dataSource,
    configService(),
    {} as OutboxService,
    gateway,
  );
  return { service, gateway, currentPayment, currentAttempt };
}

function webhookFixture() {
  const currentPayment = payment(RidePaymentStatus.PROCESSING);
  const currentAttempt = attempt();
  const events: EnqueueOutboxEventInput[] = [];
  const attemptRepository = {
    findOne: jest.fn(() => Promise.resolve(currentAttempt)),
    save: jest.fn((value: DigitalPaymentAttempt) => Promise.resolve(value)),
  };
  const paymentRepository = {
    findOne: jest.fn(() => Promise.resolve(currentPayment)),
    save: jest.fn((value: RidePayment) => Promise.resolve(value)),
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
      if (entity === RidePayment) return paymentRepository;
      if (entity === DigitalPaymentAttempt) return attemptRepository;
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
  const service = new DigitalPaymentsService(
    dataSource,
    configService(),
    outbox,
    {} as PaymentGateway,
  );
  return { service, currentPayment, currentAttempt, events, dataSource };
}

function webhookDto(overrides: Record<string, unknown> = {}) {
  const payload = {
    code: '00',
    transactionId: TRANSACTION_ID,
    response: {
      payMethod: 'YAPE_CODE',
      order: [
        {
          payMethodAuthorization: 'YAPE_CODE',
          codeAuth: 'AUTH123',
          currency: 'PEN',
          amount: '8.50',
          orderNumber: ORDER_NUMBER,
          stateMessage: 'Autorizado',
          uniqueId: 'UNIQUE123',
          referenceNumber: 'REFERENCE123',
        },
      ],
    },
    ...overrides,
  };
  const payloadHttp = JSON.stringify(payload);
  return {
    code: '00',
    message: 'Operación exitosa',
    messageUser: 'Pago confirmado',
    messageUserEng: 'Payment confirmed',
    response: {},
    payloadHttp,
    signature: createIzipaySignature(payloadHttp, KEY_HASH),
    transactionId: TRANSACTION_ID,
  };
}

describe('DigitalPaymentsService', () => {
  it('crea una sesión idempotente para el pago digital del viaje', async () => {
    const fixture = checkoutFixture();

    const result = await fixture.service.createCheckoutSession(
      PASSENGER_USER_ID,
      RIDE_ID,
      'checkout_key_123',
      { email: 'juan@example.com' },
    );

    expect(result.attemptId).toBe(ATTEMPT_ID);
    expect(result.provider).toBe(PaymentProvider.IZIPAY);
    expect(result.method).toBe(PaymentMethod.YAPE);
    expect(result.authorization).toBe('session-token');
    expect(result.orderNumber.length).toBeLessThanOrEqual(15);
    expect(fixture.currentPayment.status).toBe(RidePaymentStatus.PROCESSING);
    expect(fixture.currentAttempt.status).toBe(
      DigitalPaymentAttemptStatus.PENDING,
    );
    // Jest mock assertion; the method is not invoked unbound.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fixture.gateway.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '8.50',
        currency: 'PEN',
        email: 'juan@example.com',
      }),
    );
  });

  it('confirma un webhook firmado y no duplica su evento', async () => {
    const fixture = webhookFixture();
    const dto = webhookDto();

    await fixture.service.processIzipayWebhook(TRANSACTION_ID, dto);
    await fixture.service.processIzipayWebhook(TRANSACTION_ID, dto);

    expect(fixture.currentAttempt.status).toBe(
      DigitalPaymentAttemptStatus.SUCCEEDED,
    );
    expect(fixture.currentPayment.status).toBe(RidePaymentStatus.PAID);
    expect(fixture.events).toHaveLength(1);
    expect(fixture.events[0]?.eventType).toBe('DIGITAL_PAYMENT_CONFIRMED');
  });

  it('registra un rechazo firmado aunque el payload interno omita transactionId', async () => {
    const fixture = webhookFixture();
    const dto = webhookDto({
      code: '006',
      messageUser: 'Monto fuera del límite permitido',
      transactionId: undefined,
      response: {},
    });
    dto.code = '006';
    dto.messageUser = 'mensaje exterior alterado';

    await fixture.service.processIzipayWebhook(TRANSACTION_ID, dto);

    expect(fixture.currentAttempt.status).toBe(
      DigitalPaymentAttemptStatus.FAILED,
    );
    expect(fixture.currentAttempt.failureMessage).toBe(
      'Monto fuera del límite permitido',
    );
    expect(fixture.currentPayment.status).toBe(RidePaymentStatus.FAILED);
    expect(fixture.events[0]?.eventType).toBe('DIGITAL_PAYMENT_FAILED');
  });
  it('rechaza una firma Izipay alterada antes de tocar la base de datos', async () => {
    const fixture = webhookFixture();
    const dto = webhookDto();
    dto.signature = `${dto.signature}A`;

    await expect(
      fixture.service.processIzipayWebhook(TRANSACTION_ID, dto),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // Jest mock assertion; the method is not invoked unbound.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza una respuesta cuyo monto no coincide con el pago', async () => {
    const fixture = webhookFixture();
    const dto = webhookDto({
      response: {
        payMethod: 'YAPE_CODE',
        order: [
          {
            payMethodAuthorization: 'YAPE_CODE',
            currency: 'PEN',
            amount: '80.50',
            orderNumber: ORDER_NUMBER,
          },
        ],
      },
    });

    await expect(
      fixture.service.processIzipayWebhook(TRANSACTION_ID, dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.currentPayment.status).toBe(RidePaymentStatus.PROCESSING);
    expect(fixture.events).toHaveLength(0);
  });
});
