import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { CommissionsService } from '../commissions/commissions.service';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import {
  formatCents,
  parseScaledDecimal,
} from '../fares/utils/fixed-decimal.util';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { AdminPaymentQueryDto } from './dto/admin-payment-query.dto';
import { ConfirmCashPaymentDto } from './dto/confirm-cash-payment.dto';
import { DisputeCashPaymentDto } from './dto/dispute-cash-payment.dto';
import { ResolveCashPaymentDto } from './dto/resolve-cash-payment.dto';
import {
  RidePaymentListResponseDto,
  RidePaymentResponseDto,
} from './dto/ride-payment-response.dto';
import { RidePayment } from './entities/ride-payment.entity';
import { CashPaymentResolution } from './enums/cash-payment-resolution.enum';
import { PaymentMethod } from './enums/payment-method.enum';
import { RidePaymentStatus } from './enums/ride-payment-status.enum';

@Injectable()
export class CashPaymentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly commissionsService: CommissionsService,
  ) {}

  async getPassengerPayment(
    passengerUserId: string,
    rideId: string,
  ): Promise<RidePaymentResponseDto> {
    const payment = await this.dataSource.getRepository(RidePayment).findOne({
      where: { rideId, passengerUserId },
    });
    if (!payment) {
      throw new NotFoundException(
        'El pago no existe o el viaje todavía no finalizó',
      );
    }
    return this.map(payment);
  }

  async getDriverPayment(
    driverUserId: string,
    rideId: string,
  ): Promise<RidePaymentResponseDto> {
    const profile = await this.getApprovedDriver(driverUserId);
    const payment = await this.dataSource.getRepository(RidePayment).findOne({
      where: { rideId, driverProfileId: profile.id },
    });
    if (!payment) {
      throw new NotFoundException(
        'El pago no existe o el viaje todavía no finalizó',
      );
    }
    return this.map(payment);
  }

  async confirmCash(
    driverUserId: string,
    rideId: string,
    dto: ConfirmCashPaymentDto,
  ): Promise<RidePaymentResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedDriver(manager, driverUserId);
      const payment = await manager.getRepository(RidePayment).findOne({
        where: { rideId, driverProfileId: profile.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) {
        throw new NotFoundException(
          'El pago no existe o el viaje todavía no finalizó',
        );
      }
      if (payment.method !== PaymentMethod.CASH) {
        throw new ConflictException('El viaje no utiliza pago en efectivo');
      }

      const receivedCents = parseScaledDecimal(dto.cashReceived, 2);
      const dueCents = parseScaledDecimal(payment.amountDue, 2);
      if (receivedCents < dueCents) {
        throw new BadRequestException({
          message: 'El efectivo recibido no cubre la tarifa final',
          amountDue: payment.amountDue,
          cashReceived: dto.cashReceived,
          currency: payment.currency,
        });
      }

      if (payment.status === RidePaymentStatus.PAID) {
        if (payment.cashReceived === formatCents(receivedCents)) {
          return this.map(payment);
        }
        throw new ConflictException(
          'El pago ya fue confirmado con un importe diferente',
        );
      }
      if (
        payment.status === RidePaymentStatus.DISPUTED ||
        payment.status === RidePaymentStatus.VOIDED
      ) {
        throw new ConflictException(
          'El estado actual del pago no permite confirmarlo',
        );
      }

      const now = new Date();
      payment.status = RidePaymentStatus.PAID;
      payment.cashReceived = formatCents(receivedCents);
      payment.changeGiven = formatCents(receivedCents - dueCents);
      payment.confirmedByDriverUserId = driverUserId;
      payment.confirmedAt = now;
      payment.confirmationNotes = dto.notes?.trim() || null;
      const saved = await manager.getRepository(RidePayment).save(payment);

      await this.commissionsService.accrueWithinTransaction(
        manager,
        saved,
        now,
      );

      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'RIDE',
        aggregateId: payment.rideId,
        eventType: OutboxEventType.CASH_PAYMENT_CONFIRMED,
        payload: {
          paymentId: payment.id,
          passengerUserId: payment.passengerUserId,
          driverUserId,
          amountDue: payment.amountDue,
          cashReceived: payment.cashReceived,
          changeGiven: payment.changeGiven,
          currency: payment.currency,
          confirmedAt: now.toISOString(),
        },
      });
      return this.map(saved);
    });
  }

  async disputeCash(
    passengerUserId: string,
    rideId: string,
    dto: DisputeCashPaymentDto,
  ): Promise<RidePaymentResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.getRepository(RidePayment).findOne({
        where: { rideId, passengerUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) {
        throw new NotFoundException('El pago no existe');
      }
      if (payment.method !== PaymentMethod.CASH) {
        throw new ConflictException('El viaje no utiliza pago en efectivo');
      }
      const detail = dto.detail?.trim() || null;
      if (payment.status === RidePaymentStatus.DISPUTED) {
        if (
          payment.disputeReason === dto.reason &&
          payment.disputeDetail === detail
        ) {
          return this.map(payment);
        }
        throw new ConflictException(
          'El pago ya tiene una disputa con información diferente',
        );
      }
      if (payment.status !== RidePaymentStatus.PAID) {
        throw new ConflictException(
          'Solamente un pago confirmado puede ser disputado',
        );
      }

      const now = new Date();
      payment.status = RidePaymentStatus.DISPUTED;
      payment.disputeReason = dto.reason;
      payment.disputeDetail = detail;
      payment.disputedAt = now;
      const saved = await manager.getRepository(RidePayment).save(payment);
      await this.commissionsService.holdWithinTransaction(
        manager,
        payment.id,
        now,
      );
      const driverUserId = await this.driverUserId(
        manager,
        payment.driverProfileId,
      );

      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'RIDE',
        aggregateId: payment.rideId,
        eventType: OutboxEventType.CASH_PAYMENT_DISPUTED,
        payload: {
          paymentId: payment.id,
          passengerUserId,
          driverUserId,
          reason: dto.reason,
          disputedAt: now.toISOString(),
        },
      });
      return this.map(saved);
    });
  }

  async listAdmin(
    query: AdminPaymentQueryDto,
  ): Promise<RidePaymentListResponseDto> {
    const builder = this.dataSource
      .getRepository(RidePayment)
      .createQueryBuilder('payment');
    if (query.status) {
      builder.andWhere('payment.status = :status', { status: query.status });
    }
    if (query.method) {
      builder.andWhere('payment.method = :method', { method: query.method });
    }
    if (query.rideId) {
      builder.andWhere('payment.rideId = :rideId', { rideId: query.rideId });
    }
    if (query.passengerUserId) {
      builder.andWhere('payment.passengerUserId = :passengerUserId', {
        passengerUserId: query.passengerUserId,
      });
    }
    if (query.driverProfileId) {
      builder.andWhere('payment.driverProfileId = :driverProfileId', {
        driverProfileId: query.driverProfileId,
      });
    }
    if (query.dateFrom) {
      builder.andWhere('payment.createdAt >= :dateFrom', {
        dateFrom: new Date(query.dateFrom),
      });
    }
    if (query.dateTo) {
      builder.andWhere('payment.createdAt < :dateTo', {
        dateTo: new Date(query.dateTo),
      });
    }
    const [items, total] = await builder
      .orderBy('payment.createdAt', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      items: items.map((item) => this.map(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async resolveDispute(
    adminUserId: string,
    paymentId: string,
    dto: ResolveCashPaymentDto,
  ): Promise<RidePaymentResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.getRepository(RidePayment).findOne({
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) throw new NotFoundException('El pago no existe');
      if (payment.status !== RidePaymentStatus.DISPUTED) {
        throw new ConflictException(
          'Solamente los pagos disputados pueden ser resueltos',
        );
      }

      const now = new Date();
      payment.status =
        dto.resolution === CashPaymentResolution.CONFIRM_PAID
          ? RidePaymentStatus.PAID
          : RidePaymentStatus.VOIDED;
      payment.resolvedByAdminUserId = adminUserId;
      payment.resolvedAt = now;
      payment.resolutionNotes = dto.notes.trim();
      const saved = await manager.getRepository(RidePayment).save(payment);
      await this.commissionsService.resolveDisputeWithinTransaction(
        manager,
        saved,
        dto.resolution === CashPaymentResolution.CONFIRM_PAID,
        now,
      );
      const driverUserId = await this.driverUserId(
        manager,
        payment.driverProfileId,
      );

      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'RIDE',
        aggregateId: payment.rideId,
        eventType: OutboxEventType.CASH_PAYMENT_RESOLVED,
        payload: {
          paymentId: payment.id,
          passengerUserId: payment.passengerUserId,
          driverUserId,
          status: payment.status,
          resolvedAt: now.toISOString(),
        },
      });
      return this.map(saved);
    });
  }

  private async getApprovedDriver(
    driverUserId: string,
  ): Promise<DriverProfile> {
    const profile = await this.dataSource.getRepository(DriverProfile).findOne({
      where: { userId: driverUserId },
    });
    return this.assertApprovedDriver(profile);
  }

  private async lockApprovedDriver(
    manager: EntityManager,
    driverUserId: string,
  ): Promise<DriverProfile> {
    const profile = await manager
      .getRepository(DriverProfile)
      .createQueryBuilder('driver')
      .where('driver.user_id = :driverUserId', { driverUserId })
      .setLock('pessimistic_write')
      .getOne();
    return this.assertApprovedDriver(profile);
  }

  private assertApprovedDriver(profile: DriverProfile | null): DriverProfile {
    if (!profile) throw new NotFoundException('El perfil no existe');
    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado');
    }
    return profile;
  }

  private async driverUserId(
    manager: EntityManager,
    driverProfileId: string,
  ): Promise<string> {
    const profile = await manager.getRepository(DriverProfile).findOne({
      where: { id: driverProfileId },
    });
    if (!profile) {
      throw new ConflictException('El pago no conserva un conductor válido');
    }
    return profile.userId;
  }

  private map(payment: RidePayment): RidePaymentResponseDto {
    return {
      id: payment.id,
      rideId: payment.rideId,
      passengerUserId: payment.passengerUserId,
      driverProfileId: payment.driverProfileId,
      method: payment.method,
      status: payment.status,
      amountDue: payment.amountDue,
      grossAmount: payment.grossAmount,
      discountAmount: payment.discountAmount,
      cashReceived: payment.cashReceived,
      changeGiven: payment.changeGiven,
      currency: payment.currency,
      confirmedByDriverUserId: payment.confirmedByDriverUserId,
      confirmedAt: payment.confirmedAt,
      confirmationNotes: payment.confirmationNotes,
      disputeReason: payment.disputeReason,
      disputeDetail: payment.disputeDetail,
      disputedAt: payment.disputedAt,
      resolvedByAdminUserId: payment.resolvedByAdminUserId,
      resolvedAt: payment.resolvedAt,
      resolutionNotes: payment.resolutionNotes,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
