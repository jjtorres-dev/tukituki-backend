import { randomBytes, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { parseScaledDecimal } from '../fares/utils/fixed-decimal.util';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { CreateDigitalCheckoutSessionDto } from './dto/create-digital-checkout-session.dto';
import { DigitalCheckoutSessionResponseDto } from './dto/digital-checkout-session-response.dto';
import {
  IzipayWebhookDto,
  IzipayWebhookResponseDto,
} from './dto/izipay-webhook.dto';
import { DigitalPaymentAttempt } from './entities/digital-payment-attempt.entity';
import { RidePayment } from './entities/ride-payment.entity';
import { DigitalPaymentAttemptStatus } from './enums/digital-payment-attempt-status.enum';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentProvider } from './enums/payment-provider.enum';
import { RidePaymentStatus } from './enums/ride-payment-status.enum';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import type { PaymentGateway } from './gateways/payment-gateway.interface';
import { verifyIzipaySignature } from './utils/izipay-signature.util';

interface IzipayOrderResult {
  payMethodAuthorization?: unknown;
  codeAuth?: unknown;
  currency?: unknown;
  amount?: unknown;
  orderNumber?: unknown;
  stateMessage?: unknown;
  uniqueId?: unknown;
  referenceNumber?: unknown;
}

interface IzipayPayload {
  code?: unknown;
  messageUser?: unknown;
  transactionId?: unknown;
  response?: {
    payMethod?: unknown;
    order?: unknown;
  };
}

interface CheckoutAttemptPreparation {
  payment: RidePayment;
  attempt: DigitalPaymentAttempt;
  isNew: boolean;
}

@Injectable()
export class DigitalPaymentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
    @Inject(PAYMENT_GATEWAY)
    private readonly paymentGateway: PaymentGateway,
  ) {}

  async createCheckoutSession(
    passengerUserId: string,
    rideId: string,
    idempotencyKey: string | undefined,
    dto: CreateDigitalCheckoutSessionDto,
  ): Promise<DigitalCheckoutSessionResponseDto> {
    const normalizedKey = this.validateIdempotencyKey(idempotencyKey);
    const prepared = await this.dataSource.transaction((manager) =>
      this.prepareAttempt(manager, passengerUserId, rideId, normalizedKey),
    );

    const profile = await this.dataSource
      .getRepository(PassengerProfile)
      .findOne({
        where: { userId: passengerUserId },
        relations: { user: true },
      });
    if (!profile) {
      throw new NotFoundException('El perfil del pasajero no existe');
    }

    let gatewaySession;
    try {
      gatewaySession = await this.paymentGateway.createCheckoutSession({
        transactionId: prepared.attempt.transactionId,
        orderNumber: prepared.attempt.orderNumber,
        amount: prepared.attempt.amount,
        currency: prepared.attempt.currency,
        method: prepared.attempt.method,
        passengerUserId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: dto.email,
        phoneNumber: profile.user.phoneE164,
      });
    } catch (error) {
      if (prepared.isNew) {
        await this.markSessionCreationFailed(prepared.attempt.id, error);
      }
      throw error;
    }

    await this.dataSource.transaction(async (manager) => {
      const attempt = await manager
        .getRepository(DigitalPaymentAttempt)
        .findOne({
          where: { id: prepared.attempt.id },
          lock: { mode: 'pessimistic_write' },
        });
      if (!attempt) throw new NotFoundException('El intento de pago no existe');
      if (attempt.status === DigitalPaymentAttemptStatus.SUCCEEDED) {
        throw new ConflictException('El pago ya fue confirmado');
      }
      attempt.status = DigitalPaymentAttemptStatus.PENDING;
      attempt.sessionExpiresAt = gatewaySession.expiresAt;
      attempt.failureCode = null;
      attempt.failureMessage = null;
      await manager.getRepository(DigitalPaymentAttempt).save(attempt);

      const payment = await manager.getRepository(RidePayment).findOne({
        where: { id: attempt.paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (payment && payment.status !== RidePaymentStatus.PAID) {
        payment.status = RidePaymentStatus.PROCESSING;
        await manager.getRepository(RidePayment).save(payment);
      }
    });

    return {
      attemptId: prepared.attempt.id,
      provider: gatewaySession.provider,
      method: prepared.attempt.method,
      transactionId: prepared.attempt.transactionId,
      orderNumber: prepared.attempt.orderNumber,
      amount: prepared.attempt.amount,
      currency: prepared.attempt.currency,
      authorization: gatewaySession.authorization,
      publicKey: gatewaySession.publicKey,
      checkoutScriptUrl: gatewaySession.checkoutScriptUrl,
      checkoutConfig: gatewaySession.checkoutConfig,
      expiresAt: gatewaySession.expiresAt,
    };
  }

  async processIzipayWebhook(
    headerTransactionId: string | undefined,
    dto: IzipayWebhookDto,
  ): Promise<IzipayWebhookResponseDto> {
    if (
      dto.code === '021' ||
      dto.code.toUpperCase() === 'COMMUNICATION_ERROR'
    ) {
      return { received: true };
    }

    const keyHash = this.configService.get<string>('IZIPAY_KEY_HASH');
    if (
      !keyHash ||
      !verifyIzipaySignature(dto.payloadHttp, keyHash, dto.signature)
    ) {
      throw new UnauthorizedException('Firma Izipay inválida');
    }

    const payload = this.parsePayload(dto.payloadHttp);
    const payloadCode = this.requiredString(payload.code, 'code');
    if (payloadCode !== dto.code) {
      throw new BadRequestException(
        'El código de respuesta Izipay no coincide',
      );
    }
    const success = dto.code === '00';
    const payloadTransactionId = this.optionalString(payload.transactionId, 40);
    if (
      !headerTransactionId ||
      headerTransactionId !== dto.transactionId ||
      (payloadTransactionId !== null &&
        payloadTransactionId !== dto.transactionId) ||
      (success && payloadTransactionId === null)
    ) {
      throw new BadRequestException(
        'Los identificadores de transacción no coinciden',
      );
    }

    const order = this.extractOrder(payload);
    await this.dataSource.transaction(async (manager) => {
      const attempt = await manager
        .getRepository(DigitalPaymentAttempt)
        .findOne({
          where: { transactionId: dto.transactionId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!attempt) {
        throw new NotFoundException('La transacción Izipay no existe');
      }
      const payment = await manager.getRepository(RidePayment).findOne({
        where: { id: attempt.paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) throw new NotFoundException('El pago no existe');

      if (success) {
        this.assertSuccessfulOrder(attempt, payload, order);
        if (attempt.status === DigitalPaymentAttemptStatus.SUCCEEDED) return;
        if (
          payment.status === RidePaymentStatus.VOIDED ||
          payment.status === RidePaymentStatus.DISPUTED
        ) {
          throw new ConflictException(
            'El estado actual del pago no permite confirmarlo',
          );
        }

        const now = new Date();
        attempt.status = DigitalPaymentAttemptStatus.SUCCEEDED;
        attempt.providerAuthorizationCode = this.optionalString(
          order.codeAuth,
          100,
        );
        attempt.providerReferenceNumber = this.optionalString(
          order.referenceNumber,
          100,
        );
        attempt.providerUniqueId = this.optionalString(order.uniqueId, 100);
        attempt.providerStateMessage = this.optionalString(order.stateMessage);
        attempt.failureCode = null;
        attempt.failureMessage = null;
        attempt.completedAt = now;
        payment.status = RidePaymentStatus.PAID;
        await manager.getRepository(DigitalPaymentAttempt).save(attempt);
        await manager.getRepository(RidePayment).save(payment);

        await this.enqueueDigitalEvent(
          manager,
          payment,
          attempt,
          OutboxEventType.DIGITAL_PAYMENT_CONFIRMED,
          now,
        );
        return;
      }

      if (attempt.status === DigitalPaymentAttemptStatus.SUCCEEDED) return;
      if (
        attempt.status === DigitalPaymentAttemptStatus.FAILED &&
        attempt.failureCode === dto.code
      ) {
        return;
      }

      const now = new Date();
      attempt.status = DigitalPaymentAttemptStatus.FAILED;
      attempt.failureCode = dto.code.slice(0, 50);
      attempt.failureMessage =
        this.optionalString(payload.messageUser, 500) ??
        'Pago rechazado por Izipay';
      attempt.providerStateMessage = this.optionalString(order.stateMessage);
      attempt.completedAt = now;
      if (payment.status !== RidePaymentStatus.PAID) {
        payment.status = RidePaymentStatus.FAILED;
      }
      await manager.getRepository(DigitalPaymentAttempt).save(attempt);
      await manager.getRepository(RidePayment).save(payment);
      await this.enqueueDigitalEvent(
        manager,
        payment,
        attempt,
        OutboxEventType.DIGITAL_PAYMENT_FAILED,
        now,
      );
    });

    return { received: true };
  }

  private async prepareAttempt(
    manager: EntityManager,
    passengerUserId: string,
    rideId: string,
    idempotencyKey: string,
  ): Promise<CheckoutAttemptPreparation> {
    const payment = await manager.getRepository(RidePayment).findOne({
      where: { rideId, passengerUserId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) {
      throw new NotFoundException(
        'El pago no existe o el viaje todavía no finalizó',
      );
    }
    this.assertDigitalPaymentCanStart(payment);

    const attemptRepository = manager.getRepository(DigitalPaymentAttempt);
    const repeated = await attemptRepository.findOne({
      where: { paymentId: payment.id, idempotencyKey },
    });
    if (repeated) {
      this.assertAttemptCanCreateSession(repeated);
      return { payment, attempt: repeated, isNew: false };
    }

    const active = await attemptRepository.findOne({
      where: {
        paymentId: payment.id,
        status: In([
          DigitalPaymentAttemptStatus.CREATED,
          DigitalPaymentAttemptStatus.PENDING,
        ]),
      },
      order: { createdAt: 'DESC' },
    });
    if (active && !this.isExpired(active)) {
      throw new ConflictException('Ya existe una sesión activa para este pago');
    }
    if (active && this.isExpired(active)) {
      active.status = DigitalPaymentAttemptStatus.EXPIRED;
      await attemptRepository.save(active);
    }

    const attempt = attemptRepository.create({
      paymentId: payment.id,
      provider: PaymentProvider.IZIPAY,
      method: payment.method,
      status: DigitalPaymentAttemptStatus.CREATED,
      idempotencyKey,
      transactionId: randomUUID().replaceAll('-', ''),
      orderNumber: this.createOrderNumber(),
      amount: payment.amountDue,
      currency: payment.currency,
      sessionExpiresAt: null,
      providerAuthorizationCode: null,
      providerReferenceNumber: null,
      providerUniqueId: null,
      providerStateMessage: null,
      failureCode: null,
      failureMessage: null,
      completedAt: null,
    });
    const saved = await attemptRepository.save(attempt);
    payment.status = RidePaymentStatus.PROCESSING;
    await manager.getRepository(RidePayment).save(payment);
    return { payment, attempt: saved, isNew: true };
  }

  private assertDigitalPaymentCanStart(payment: RidePayment): void {
    if (
      ![PaymentMethod.YAPE, PaymentMethod.PLIN, PaymentMethod.CARD].includes(
        payment.method,
      )
    ) {
      throw new ConflictException('El viaje no utiliza un pago digital');
    }
    if (payment.status === RidePaymentStatus.PAID) {
      throw new ConflictException('El pago ya fue confirmado');
    }
    if (
      payment.status === RidePaymentStatus.DISPUTED ||
      payment.status === RidePaymentStatus.VOIDED
    ) {
      throw new ConflictException(
        'El estado actual del pago no permite iniciar una sesión',
      );
    }
  }

  private assertAttemptCanCreateSession(attempt: DigitalPaymentAttempt): void {
    if (this.isExpired(attempt)) {
      throw new ConflictException(
        'La sesión idempotente expiró; utiliza una nueva clave',
      );
    }
    if (
      attempt.status === DigitalPaymentAttemptStatus.FAILED ||
      attempt.status === DigitalPaymentAttemptStatus.EXPIRED
    ) {
      throw new ConflictException(
        'El intento terminó; utiliza una nueva clave de idempotencia',
      );
    }
    if (attempt.status === DigitalPaymentAttemptStatus.SUCCEEDED) {
      throw new ConflictException('El pago ya fue confirmado');
    }
  }

  private async markSessionCreationFailed(
    attemptId: string,
    error: unknown,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const attempt = await manager
        .getRepository(DigitalPaymentAttempt)
        .findOne({
          where: { id: attemptId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!attempt || attempt.status !== DigitalPaymentAttemptStatus.CREATED) {
        return;
      }
      attempt.status = DigitalPaymentAttemptStatus.FAILED;
      attempt.failureCode = 'SESSION_CREATION_FAILED';
      attempt.failureMessage =
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'No fue posible crear la sesión';
      attempt.completedAt = new Date();
      await manager.getRepository(DigitalPaymentAttempt).save(attempt);

      const payment = await manager.getRepository(RidePayment).findOne({
        where: { id: attempt.paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (payment && payment.status !== RidePaymentStatus.PAID) {
        payment.status = RidePaymentStatus.FAILED;
        await manager.getRepository(RidePayment).save(payment);
      }
    });
  }

  private async enqueueDigitalEvent(
    manager: EntityManager,
    payment: RidePayment,
    attempt: DigitalPaymentAttempt,
    eventType:
      | OutboxEventType.DIGITAL_PAYMENT_CONFIRMED
      | OutboxEventType.DIGITAL_PAYMENT_FAILED,
    occurredAt: Date,
  ): Promise<void> {
    const driver = await manager.getRepository(DriverProfile).findOne({
      where: { id: payment.driverProfileId },
    });
    if (!driver) {
      throw new ConflictException('El pago no conserva un conductor válido');
    }
    await this.outboxService.enqueueWithinTransaction(manager, {
      aggregateType: 'RIDE',
      aggregateId: payment.rideId,
      eventType,
      payload: {
        paymentId: payment.id,
        attemptId: attempt.id,
        passengerUserId: payment.passengerUserId,
        driverUserId: driver.userId,
        method: payment.method,
        amount: attempt.amount,
        currency: attempt.currency,
        failureCode: attempt.failureCode,
        occurredAt: occurredAt.toISOString(),
      },
    });
  }

  private parsePayload(payloadHttp: string): IzipayPayload {
    try {
      const payload = JSON.parse(payloadHttp) as IzipayPayload;
      if (!payload || typeof payload !== 'object') throw new Error();
      return payload;
    } catch {
      throw new BadRequestException('payloadHttp no contiene JSON válido');
    }
  }

  private extractOrder(payload: IzipayPayload): IzipayOrderResult {
    const orders = payload.response?.order;
    if (!Array.isArray(orders) || !orders[0] || typeof orders[0] !== 'object') {
      return {};
    }
    return orders[0] as IzipayOrderResult;
  }

  private assertSuccessfulOrder(
    attempt: DigitalPaymentAttempt,
    payload: IzipayPayload,
    order: IzipayOrderResult,
  ): void {
    const orderNumber = this.requiredString(order.orderNumber, 'orderNumber');
    const amount = this.requiredString(order.amount, 'amount');
    const currency = this.requiredString(order.currency, 'currency');
    const providerMethod = this.requiredString(
      order.payMethodAuthorization ?? payload.response?.payMethod,
      'payMethodAuthorization',
    );
    if (orderNumber !== attempt.orderNumber) {
      throw new BadRequestException('La orden Izipay no coincide');
    }
    if (
      parseScaledDecimal(amount, 2) !== parseScaledDecimal(attempt.amount, 2) ||
      currency !== attempt.currency
    ) {
      throw new BadRequestException('El monto o moneda Izipay no coincide');
    }
    if (this.mapIzipayMethod(providerMethod) !== attempt.method) {
      throw new BadRequestException('El método de pago Izipay no coincide');
    }
  }

  private mapIzipayMethod(method: string): PaymentMethod {
    switch (method.toUpperCase()) {
      case 'YAPE':
      case 'YAPE_CODE':
        return PaymentMethod.YAPE;
      case 'PLIN':
      case 'PAGO_PUSH':
      case 'PLIN_INTERBANK':
        return PaymentMethod.PLIN;
      case 'CARD':
        return PaymentMethod.CARD;
      default:
        throw new BadRequestException(
          `Método Izipay no soportado: ${method.slice(0, 50)}`,
        );
    }
  }

  private validateIdempotencyKey(value: string | undefined): string {
    const normalized = value?.trim();
    if (!normalized || !/^[A-Za-z0-9_-]{8,100}$/.test(normalized)) {
      throw new BadRequestException(
        'Idempotency-Key debe tener entre 8 y 100 caracteres seguros',
      );
    }
    return normalized;
  }

  private isExpired(attempt: DigitalPaymentAttempt): boolean {
    return (
      attempt.status === DigitalPaymentAttemptStatus.EXPIRED ||
      (!!attempt.sessionExpiresAt &&
        attempt.sessionExpiresAt.getTime() <= Date.now())
    );
  }

  private createOrderNumber(): string {
    return `TT${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
      .toUpperCase()
      .slice(0, 15);
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`Izipay no envió ${field}`);
    }
    return value.trim();
  }

  private optionalString(value: unknown, maxLength = 200): string | null {
    return typeof value === 'string' && value.trim()
      ? value.trim().slice(0, maxLength)
      : null;
  }
}
