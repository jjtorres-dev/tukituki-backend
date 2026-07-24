import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import {
  formatCents,
  parseScaledDecimal,
} from '../fares/utils/fixed-decimal.util';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { RidePayment } from '../payments/entities/ride-payment.entity';
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { RidePaymentStatus } from '../payments/enums/ride-payment-status.enum';
import { Ride } from '../rides/entities/ride.entity';
import { COMMISSION_SETTLEMENT_HOLDBACK_MS } from './commission-lifecycle.constants';
import {
  AdminCommissionQueryDto,
  CommissionQueryDto,
} from './dto/commission-query.dto';
import {
  CommissionListResponseDto,
  CommissionSummaryResponseDto,
  RideCommissionResponseDto,
} from './dto/commission-response.dto';
import { RideCommission } from './entities/ride-commission.entity';
import { CommissionCollectionMode } from './enums/commission-collection-mode.enum';
import { RideCommissionStatus } from './enums/ride-commission-status.enum';

interface SummaryRow {
  rideCount: string | number;
  grossFare: string;
  platformCommission: string;
  driverNet: string;
  cashCommissionReceivable: string;
  digitalNetPayable: string;
  heldCommission: string;
  reversedCommission: string;
}

@Injectable()
export class CommissionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
  ) {}

  async accrueWithinTransaction(
    manager: EntityManager,
    payment: RidePayment,
    accruedAt: Date,
  ): Promise<RideCommission> {
    if (payment.status !== RidePaymentStatus.PAID) {
      throw new ConflictException(
        'La comisión solo puede generarse para un pago confirmado',
      );
    }
    const repository = manager.getRepository(RideCommission);
    const existing = await repository.findOne({
      where: { paymentId: payment.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) return existing;

    const ride = await manager.getRepository(Ride).findOne({
      where: { id: payment.rideId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!ride) throw new NotFoundException('El viaje de la comisión no existe');
    const driver = await manager.getRepository(DriverProfile).findOne({
      where: { id: payment.driverProfileId },
    });
    if (!driver) {
      throw new NotFoundException('El conductor de la comisión no existe');
    }

    const baseCents = parseScaledDecimal(payment.amountDue, 2);
    const rateBps = ride.platformCommissionRateBps;
    const commissionCents = (baseCents * BigInt(rateBps) + 5_000n) / 10_000n;
    const collectionMode =
      payment.method === PaymentMethod.CASH
        ? CommissionCollectionMode.DRIVER_PAYABLE
        : CommissionCollectionMode.DEDUCT_FROM_PAYOUT;
    const commission = repository.create({
      rideId: payment.rideId,
      paymentId: payment.id,
      driverProfileId: payment.driverProfileId,
      policyId: ride.commissionPolicyId,
      paymentMethod: payment.method,
      collectionMode,
      status: RideCommissionStatus.ACCRUED,
      rateBps,
      baseAmount: formatCents(baseCents),
      commissionAmount: formatCents(commissionCents),
      driverNetAmount: formatCents(baseCents - commissionCents),
      currency: payment.currency,
      accruedAt,
      eligibleAt: new Date(
        accruedAt.getTime() + COMMISSION_SETTLEMENT_HOLDBACK_MS,
      ),
      heldAt: null,
      settledAt: null,
      reversedAt: null,
    });
    const saved = await repository.save(commission);

    await this.outboxService.enqueueWithinTransaction(manager, {
      aggregateType: 'RIDE',
      aggregateId: payment.rideId,
      eventType: OutboxEventType.PLATFORM_COMMISSION_ACCRUED,
      payload: {
        commissionId: saved.id,
        paymentId: payment.id,
        driverUserId: driver.userId,
        rateBps,
        ratePercent: (rateBps / 100).toFixed(2),
        baseAmount: saved.baseAmount,
        commissionAmount: saved.commissionAmount,
        driverNetAmount: saved.driverNetAmount,
        currency: saved.currency,
        collectionMode,
        accruedAt: accruedAt.toISOString(),
      },
    });
    return saved;
  }

  async holdWithinTransaction(
    manager: EntityManager,
    paymentId: string,
    heldAt: Date,
  ): Promise<void> {
    const repository = manager.getRepository(RideCommission);
    const commission = await repository.findOne({
      where: { paymentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!commission) return;
    if (
      [RideCommissionStatus.ALLOCATED, RideCommissionStatus.SETTLED].includes(
        commission.status,
      ) ||
      heldAt.getTime() >= commission.eligibleAt.getTime()
    ) {
      throw new ConflictException(
        'El plazo de disputa termino porque el pago entro al cierre contable',
      );
    }
    if (commission.status !== RideCommissionStatus.ACCRUED) return;
    commission.status = RideCommissionStatus.HELD;
    commission.heldAt = heldAt;
    await repository.save(commission);
  }

  async resolveDisputeWithinTransaction(
    manager: EntityManager,
    payment: RidePayment,
    confirmedPaid: boolean,
    resolvedAt: Date,
  ): Promise<void> {
    const repository = manager.getRepository(RideCommission);
    const commission = await repository.findOne({
      where: { paymentId: payment.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!commission) {
      if (confirmedPaid) {
        await this.accrueWithinTransaction(manager, payment, resolvedAt);
      }
      return;
    }
    if (confirmedPaid && commission.status === RideCommissionStatus.HELD) {
      commission.status = RideCommissionStatus.ACCRUED;
      commission.heldAt = null;
      await repository.save(commission);
      return;
    }
    if (
      !confirmedPaid &&
      [RideCommissionStatus.ACCRUED, RideCommissionStatus.HELD].includes(
        commission.status,
      )
    ) {
      commission.status = RideCommissionStatus.REVERSED;
      commission.reversedAt = resolvedAt;
      await repository.save(commission);
    }
  }

  async listForDriver(
    driverUserId: string,
    query: CommissionQueryDto,
  ): Promise<CommissionListResponseDto> {
    const driver = await this.getDriver(driverUserId);
    return this.list(query, driver.id);
  }

  listForAdmin(
    query: AdminCommissionQueryDto,
  ): Promise<CommissionListResponseDto> {
    return this.list(query, query.driverProfileId);
  }

  async summaryForDriver(
    driverUserId: string,
    query: CommissionQueryDto,
  ): Promise<CommissionSummaryResponseDto> {
    const driver = await this.getDriver(driverUserId);
    return this.summary(query, driver.id);
  }

  summaryForAdmin(
    query: AdminCommissionQueryDto,
  ): Promise<CommissionSummaryResponseDto> {
    return this.summary(query, query.driverProfileId);
  }

  private async list(
    query: CommissionQueryDto,
    driverProfileId?: string,
  ): Promise<CommissionListResponseDto> {
    const builder = this.dataSource
      .getRepository(RideCommission)
      .createQueryBuilder('commission');
    this.applyFilters(builder, query, driverProfileId);
    const [items, total] = await builder
      .orderBy('commission.accruedAt', 'DESC')
      .addOrderBy('commission.id', 'DESC')
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

  private async summary(
    query: CommissionQueryDto,
    driverProfileId?: string,
  ): Promise<CommissionSummaryResponseDto> {
    const builder = this.dataSource
      .getRepository(RideCommission)
      .createQueryBuilder('commission');
    this.applyFilters(builder, query, driverProfileId);
    const row = await builder
      .select(
        `COUNT(*) FILTER (
          WHERE commission.status <> :reversed
        )`,
        'rideCount',
      )
      .addSelect(
        `COALESCE(SUM(commission.baseAmount) FILTER (
          WHERE commission.status <> :reversed
        ), 0)`,
        'grossFare',
      )
      .addSelect(
        `COALESCE(SUM(commission.commissionAmount) FILTER (
          WHERE commission.status <> :reversed
        ), 0)`,
        'platformCommission',
      )
      .addSelect(
        `COALESCE(SUM(commission.driverNetAmount) FILTER (
          WHERE commission.status <> :reversed
        ), 0)`,
        'driverNet',
      )
      .addSelect(
        `COALESCE(SUM(commission.commissionAmount) FILTER (
          WHERE commission.collectionMode = :driverPayable
            AND commission.status = :accrued
        ), 0)`,
        'cashCommissionReceivable',
      )
      .addSelect(
        `COALESCE(SUM(commission.driverNetAmount) FILTER (
          WHERE commission.collectionMode = :deductFromPayout
            AND commission.status = :accrued
        ), 0)`,
        'digitalNetPayable',
      )
      .addSelect(
        `COALESCE(SUM(commission.commissionAmount) FILTER (
          WHERE commission.status = :held
        ), 0)`,
        'heldCommission',
      )
      .addSelect(
        `COALESCE(SUM(commission.commissionAmount) FILTER (
          WHERE commission.status = :reversed
        ), 0)`,
        'reversedCommission',
      )
      .setParameters({
        reversed: RideCommissionStatus.REVERSED,
        accrued: RideCommissionStatus.ACCRUED,
        held: RideCommissionStatus.HELD,
        driverPayable: CommissionCollectionMode.DRIVER_PAYABLE,
        deductFromPayout: CommissionCollectionMode.DEDUCT_FROM_PAYOUT,
      })
      .getRawOne<SummaryRow>();
    return {
      rideCount: Number(row?.rideCount ?? 0),
      grossFare: this.decimal(row?.grossFare),
      platformCommission: this.decimal(row?.platformCommission),
      driverNet: this.decimal(row?.driverNet),
      cashCommissionReceivable: this.decimal(row?.cashCommissionReceivable),
      digitalNetPayable: this.decimal(row?.digitalNetPayable),
      heldCommission: this.decimal(row?.heldCommission),
      reversedCommission: this.decimal(row?.reversedCommission),
      currency: 'PEN',
    };
  }

  private applyFilters(
    builder: SelectQueryBuilder<RideCommission>,
    query: CommissionQueryDto,
    driverProfileId?: string,
  ): void {
    if (driverProfileId) {
      builder.andWhere('commission.driverProfileId = :driverProfileId', {
        driverProfileId,
      });
    }
    if (query.status) {
      builder.andWhere('commission.status = :status', {
        status: query.status,
      });
    }
    if (query.paymentMethod) {
      builder.andWhere('commission.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }
    if (query.collectionMode) {
      builder.andWhere('commission.collectionMode = :collectionMode', {
        collectionMode: query.collectionMode,
      });
    }
    if ('rideId' in query && typeof query.rideId === 'string') {
      builder.andWhere('commission.rideId = :rideId', {
        rideId: query.rideId,
      });
    }
    if (query.dateFrom) {
      builder.andWhere('commission.accruedAt >= :dateFrom', {
        dateFrom: new Date(query.dateFrom),
      });
    }
    if (query.dateTo) {
      builder.andWhere('commission.accruedAt < :dateTo', {
        dateTo: new Date(query.dateTo),
      });
    }
  }

  private async getDriver(driverUserId: string): Promise<DriverProfile> {
    const driver = await this.dataSource.getRepository(DriverProfile).findOne({
      where: { userId: driverUserId },
    });
    if (!driver) throw new NotFoundException('El perfil no existe');
    if (driver.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado');
    }
    return driver;
  }

  private map(commission: RideCommission): RideCommissionResponseDto {
    return {
      id: commission.id,
      rideId: commission.rideId,
      paymentId: commission.paymentId,
      driverProfileId: commission.driverProfileId,
      paymentMethod: commission.paymentMethod,
      collectionMode: commission.collectionMode,
      status: commission.status,
      rateBps: commission.rateBps,
      ratePercent: (commission.rateBps / 100).toFixed(2),
      baseAmount: commission.baseAmount,
      commissionAmount: commission.commissionAmount,
      driverNetAmount: commission.driverNetAmount,
      currency: commission.currency,
      accruedAt: commission.accruedAt,
      eligibleAt: commission.eligibleAt,
      heldAt: commission.heldAt,
      settledAt: commission.settledAt,
      reversedAt: commission.reversedAt,
    };
  }

  private decimal(value: string | undefined): string {
    return Number(value ?? 0).toFixed(2);
  }
}
