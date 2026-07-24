import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';

import { RideCommission } from '../commissions/entities/ride-commission.entity';
import { CommissionCollectionMode } from '../commissions/enums/commission-collection-mode.enum';
import { RideCommissionStatus } from '../commissions/enums/ride-commission-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import {
  formatCents,
  parseScaledDecimal,
} from '../fares/utils/fixed-decimal.util';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import {
  ApproveSettlementDto,
  CancelSettlementDto,
  CompleteSettlementDto,
} from './dto/settlement-action.dto';
import { CreateDriverSettlementDto } from './dto/create-driver-settlement.dto';
import {
  AdminSettlementQueryDto,
  SettlementQueryDto,
} from './dto/settlement-query.dto';
import {
  DriverSettlementBalanceResponseDto,
  DriverSettlementDetailResponseDto,
  DriverSettlementItemResponseDto,
  DriverSettlementListResponseDto,
  DriverSettlementResponseDto,
} from './dto/settlement-response.dto';
import { DriverSettlementItem } from './entities/driver-settlement-item.entity';
import { DriverSettlement } from './entities/driver-settlement.entity';
import { SettlementDirection } from './enums/settlement-direction.enum';
import { SettlementStatus } from './enums/settlement-status.enum';

const MAX_SETTLEMENT_PERIOD_MS = 31 * 24 * 60 * 60 * 1000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

interface SettlementTotals {
  grossFareCents: bigint;
  platformCommissionCents: bigint;
  digitalNetCents: bigint;
  cashCommissionCents: bigint;
  promotionCreditCents: bigint;
  settlementCents: bigint;
  direction: SettlementDirection;
}

interface BalanceRow {
  availableDigitalNet?: string;
  availablePromotionCredit?: string;
  availableCashCommission?: string;
  allocatedDigitalNet?: string;
  allocatedPromotionCredit?: string;
  allocatedCashCommission?: string;
  heldCommission?: string;
}

@Injectable()
export class DriverSettlementsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
  ) {}

  async create(
    adminUserId: string,
    idempotencyKey: string | undefined,
    dto: CreateDriverSettlementDto,
  ): Promise<DriverSettlementDetailResponseDto> {
    const key = this.validateIdempotencyKey(idempotencyKey);
    const { periodStart, periodEnd } = this.validatePeriod(dto);

    return this.dataSource.transaction(async (manager) => {
      await this.advisoryLock(manager, `settlement-key:${key}`);
      const repository = manager.getRepository(DriverSettlement);
      const existing = await repository.findOne({
        where: { idempotencyKey: key },
      });
      if (existing) {
        this.assertSameRequest(existing, dto, periodStart, periodEnd);
        const items = await manager.getRepository(DriverSettlementItem).find({
          where: { settlementId: existing.id },
          order: { accruedAt: 'ASC', id: 'ASC' },
        });
        return this.mapDetail(existing, items);
      }

      await this.advisoryLock(
        manager,
        `settlement-driver:${dto.driverProfileId}`,
      );
      const driver = await manager.getRepository(DriverProfile).findOne({
        where: { id: dto.driverProfileId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!driver) throw new NotFoundException('El conductor no existe');

      const active = await repository.findOne({
        where: {
          driverProfileId: dto.driverProfileId,
          status: In([SettlementStatus.DRAFT, SettlementStatus.APPROVED]),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (active) {
        throw new ConflictException(
          'El conductor ya tiene una liquidacion pendiente de cierre',
        );
      }

      const now = new Date();
      const commissions = await manager
        .getRepository(RideCommission)
        .createQueryBuilder('commission')
        .where('commission.driverProfileId = :driverProfileId', {
          driverProfileId: dto.driverProfileId,
        })
        .andWhere('commission.status = :status', {
          status: RideCommissionStatus.ACCRUED,
        })
        .andWhere('commission.accruedAt >= :periodStart', { periodStart })
        .andWhere('commission.accruedAt < :periodEnd', { periodEnd })
        .andWhere('commission.eligibleAt <= :now', { now })
        .orderBy('commission.accruedAt', 'ASC')
        .addOrderBy('commission.id', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      if (commissions.length === 0) {
        throw new ConflictException(
          'No existen comisiones elegibles en el periodo solicitado',
        );
      }

      const currencies = new Set(commissions.map((item) => item.currency));
      if (currencies.size !== 1) {
        throw new ConflictException(
          'Una liquidacion no puede mezclar monedas diferentes',
        );
      }
      const currency = commissions[0]?.currency;
      if (!currency) throw new ConflictException('La moneda no es valida');
      const totals = this.calculateTotals(commissions);
      const settlement = repository.create({
        driverProfileId: dto.driverProfileId,
        idempotencyKey: key,
        periodStart,
        periodEnd,
        status: SettlementStatus.DRAFT,
        direction: totals.direction,
        currency,
        rideCount: commissions.length,
        grossFareAmount: formatCents(totals.grossFareCents),
        platformCommissionAmount: formatCents(totals.platformCommissionCents),
        digitalNetAmount: formatCents(totals.digitalNetCents),
        cashCommissionAmount: formatCents(totals.cashCommissionCents),
        promotionCreditAmount: formatCents(totals.promotionCreditCents),
        settlementAmount: formatCents(totals.settlementCents),
        createdByAdminUserId: adminUserId,
        approvedByAdminUserId: null,
        settledByAdminUserId: null,
        cancelledByAdminUserId: null,
        transferReference: null,
        notes: dto.notes?.trim() || null,
        approvedAt: null,
        settledAt: null,
        cancelledAt: null,
      });
      const saved = await repository.save(settlement);
      const itemRepository = manager.getRepository(DriverSettlementItem);
      const items = commissions.map((commission) =>
        itemRepository.create({
          settlementId: saved.id,
          commissionId: commission.id,
          rideId: commission.rideId,
          collectionMode: commission.collectionMode,
          baseAmount: commission.baseAmount,
          commissionAmount: commission.commissionAmount,
          driverNetAmount: commission.driverNetAmount,
          promotionCreditAmount: commission.promotionCreditAmount ?? '0.00',
          netEffectAmount: this.netEffect(commission),
          currency: commission.currency,
          accruedAt: commission.accruedAt,
          releasedAt: null,
        }),
      );
      const savedItems = await itemRepository.save(items);
      for (const commission of commissions) {
        commission.status = RideCommissionStatus.ALLOCATED;
      }
      await manager.getRepository(RideCommission).save(commissions);
      return this.mapDetail(saved, savedItems);
    });
  }

  async approve(
    adminUserId: string,
    settlementId: string,
    dto: ApproveSettlementDto,
  ): Promise<DriverSettlementResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await this.lockSettlement(manager, settlementId);
      if (settlement.status === SettlementStatus.APPROVED) {
        return this.map(settlement);
      }
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new ConflictException(
          'Solo una liquidacion en borrador puede aprobarse',
        );
      }
      const now = new Date();
      settlement.status = SettlementStatus.APPROVED;
      settlement.approvedByAdminUserId = adminUserId;
      settlement.approvedAt = now;
      settlement.notes = this.appendNotes(settlement.notes, dto.notes);
      const saved = await manager
        .getRepository(DriverSettlement)
        .save(settlement);
      const driver = await this.driverById(manager, settlement.driverProfileId);
      await this.enqueueSettlementEvent(
        manager,
        saved,
        driver.userId,
        OutboxEventType.DRIVER_SETTLEMENT_APPROVED,
        now,
      );
      return this.map(saved);
    });
  }

  async complete(
    adminUserId: string,
    settlementId: string,
    dto: CompleteSettlementDto,
  ): Promise<DriverSettlementResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await this.lockSettlement(manager, settlementId);
      const reference = dto.transferReference?.trim() || null;
      if (settlement.status === SettlementStatus.SETTLED) {
        if (settlement.transferReference === reference) {
          return this.map(settlement);
        }
        throw new ConflictException(
          'La liquidacion ya fue cerrada con otra referencia',
        );
      }
      if (settlement.status !== SettlementStatus.APPROVED) {
        throw new ConflictException(
          'Solo una liquidacion aprobada puede cerrarse',
        );
      }
      if (
        settlement.direction !== SettlementDirection.BALANCED &&
        reference === null
      ) {
        throw new BadRequestException(
          'La referencia de transferencia o cobro es obligatoria',
        );
      }
      if (reference) {
        const duplicate = await manager
          .getRepository(DriverSettlement)
          .findOne({
            where: { transferReference: reference },
          });
        if (duplicate && duplicate.id !== settlement.id) {
          throw new ConflictException('La referencia externa ya fue utilizada');
        }
      }

      const itemRepository = manager.getRepository(DriverSettlementItem);
      const items = await itemRepository.find({
        where: { settlementId, releasedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (items.length !== settlement.rideCount) {
        throw new ConflictException(
          'Los items activos no coinciden con la liquidacion',
        );
      }
      const commissions = await manager.getRepository(RideCommission).find({
        where: { id: In(items.map((item) => item.commissionId)) },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        commissions.length !== items.length ||
        commissions.some(
          (commission) => commission.status !== RideCommissionStatus.ALLOCATED,
        )
      ) {
        throw new ConflictException(
          'Las comisiones de la liquidacion ya no estan reservadas',
        );
      }

      const now = new Date();
      for (const commission of commissions) {
        commission.status = RideCommissionStatus.SETTLED;
        commission.settledAt = now;
      }
      await manager.getRepository(RideCommission).save(commissions);
      settlement.status = SettlementStatus.SETTLED;
      settlement.settledByAdminUserId = adminUserId;
      settlement.settledAt = now;
      settlement.transferReference = reference;
      settlement.notes = this.appendNotes(settlement.notes, dto.notes);
      const saved = await manager
        .getRepository(DriverSettlement)
        .save(settlement);
      const driver = await this.driverById(manager, settlement.driverProfileId);
      await this.enqueueSettlementEvent(
        manager,
        saved,
        driver.userId,
        OutboxEventType.DRIVER_SETTLEMENT_SETTLED,
        now,
      );
      return this.map(saved);
    });
  }

  async cancel(
    adminUserId: string,
    settlementId: string,
    dto: CancelSettlementDto,
  ): Promise<DriverSettlementResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await this.lockSettlement(manager, settlementId);
      if (settlement.status === SettlementStatus.CANCELLED) {
        return this.map(settlement);
      }
      if (
        ![SettlementStatus.DRAFT, SettlementStatus.APPROVED].includes(
          settlement.status,
        )
      ) {
        throw new ConflictException(
          'La liquidacion cerrada no puede cancelarse',
        );
      }
      const itemRepository = manager.getRepository(DriverSettlementItem);
      const items = await itemRepository.find({
        where: { settlementId, releasedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (items.length !== settlement.rideCount) {
        throw new ConflictException(
          'Los items activos no coinciden con la liquidacion',
        );
      }
      const commissions = await manager.getRepository(RideCommission).find({
        where: { id: In(items.map((item) => item.commissionId)) },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        commissions.length !== items.length ||
        commissions.some(
          (commission) => commission.status !== RideCommissionStatus.ALLOCATED,
        )
      ) {
        throw new ConflictException(
          'Las comisiones no pueden liberarse de forma segura',
        );
      }
      const now = new Date();
      for (const commission of commissions) {
        commission.status = RideCommissionStatus.ACCRUED;
      }
      for (const item of items) item.releasedAt = now;
      await manager.getRepository(RideCommission).save(commissions);
      await itemRepository.save(items);

      settlement.status = SettlementStatus.CANCELLED;
      settlement.cancelledByAdminUserId = adminUserId;
      settlement.cancelledAt = now;
      settlement.notes = this.appendNotes(
        settlement.notes,
        `Cancelacion: ${dto.reason.trim()}`,
      );
      const saved = await manager
        .getRepository(DriverSettlement)
        .save(settlement);
      const driver = await this.driverById(manager, settlement.driverProfileId);
      await this.enqueueSettlementEvent(
        manager,
        saved,
        driver.userId,
        OutboxEventType.DRIVER_SETTLEMENT_CANCELLED,
        now,
      );
      return this.map(saved);
    });
  }

  listForAdmin(
    query: AdminSettlementQueryDto,
  ): Promise<DriverSettlementListResponseDto> {
    return this.list(query, query.driverProfileId);
  }

  async listForDriver(
    driverUserId: string,
    query: SettlementQueryDto,
  ): Promise<DriverSettlementListResponseDto> {
    const driver = await this.driverByUserId(driverUserId);
    return this.list(query, driver.id);
  }

  async detailForAdmin(
    settlementId: string,
  ): Promise<DriverSettlementDetailResponseDto> {
    return this.detail(settlementId);
  }

  async detailForDriver(
    driverUserId: string,
    settlementId: string,
  ): Promise<DriverSettlementDetailResponseDto> {
    const driver = await this.driverByUserId(driverUserId);
    return this.detail(settlementId, driver.id);
  }

  async balanceForDriver(
    driverUserId: string,
  ): Promise<DriverSettlementBalanceResponseDto> {
    const driver = await this.driverByUserId(driverUserId);
    const now = new Date();
    const row = await this.dataSource
      .getRepository(RideCommission)
      .createQueryBuilder('commission')
      .select(
        `COALESCE(SUM(commission.driverNetAmount) FILTER (
          WHERE commission.status = :accrued
            AND commission.collectionMode = :digital
            AND commission.eligibleAt <= :now
        ), 0)`,
        'availableDigitalNet',
      )
      .addSelect(
        `COALESCE(SUM(commission.commissionAmount) FILTER (
          WHERE commission.status = :accrued
            AND commission.collectionMode = :cash
            AND commission.eligibleAt <= :now
        ), 0)`,
        'availableCashCommission',
      )
      .addSelect(
        `COALESCE(SUM(commission.promotionCreditAmount) FILTER (
          WHERE commission.status = :accrued
            AND commission.collectionMode = :cash
            AND commission.eligibleAt <= :now
        ), 0)`,
        'availablePromotionCredit',
      )
      .addSelect(
        `COALESCE(SUM(commission.driverNetAmount) FILTER (
          WHERE commission.status = :allocated
            AND commission.collectionMode = :digital
        ), 0)`,
        'allocatedDigitalNet',
      )
      .addSelect(
        `COALESCE(SUM(commission.commissionAmount) FILTER (
          WHERE commission.status = :allocated
            AND commission.collectionMode = :cash
        ), 0)`,
        'allocatedCashCommission',
      )
      .addSelect(
        `COALESCE(SUM(commission.promotionCreditAmount) FILTER (
          WHERE commission.status = :allocated
            AND commission.collectionMode = :cash
        ), 0)`,
        'allocatedPromotionCredit',
      )
      .addSelect(
        `COALESCE(SUM(commission.commissionAmount) FILTER (
          WHERE commission.status = :held
        ), 0)`,
        'heldCommission',
      )
      .where('commission.driverProfileId = :driverProfileId', {
        driverProfileId: driver.id,
      })
      .setParameters({
        accrued: RideCommissionStatus.ACCRUED,
        allocated: RideCommissionStatus.ALLOCATED,
        held: RideCommissionStatus.HELD,
        digital: CommissionCollectionMode.DEDUCT_FROM_PAYOUT,
        cash: CommissionCollectionMode.DRIVER_PAYABLE,
        now,
      })
      .getRawOne<BalanceRow>();
    const availableDigital = parseScaledDecimal(
      row?.availableDigitalNet ?? '0',
      2,
    );
    const availableCash = parseScaledDecimal(
      row?.availableCashCommission ?? '0',
      2,
    );
    const availablePromotion = parseScaledDecimal(
      row?.availablePromotionCredit ?? '0',
      2,
    );
    const allocatedDigital = parseScaledDecimal(
      row?.allocatedDigitalNet ?? '0',
      2,
    );
    const allocatedCash = parseScaledDecimal(
      row?.allocatedCashCommission ?? '0',
      2,
    );
    const allocatedPromotion = parseScaledDecimal(
      row?.allocatedPromotionCredit ?? '0',
      2,
    );
    const available = this.signedDirection(
      availableDigital + availablePromotion,
      availableCash,
    );
    const allocated = this.signedDirection(
      allocatedDigital + allocatedPromotion,
      allocatedCash,
    );
    return {
      availableDigitalNet: formatCents(availableDigital),
      availableCashCommissionDebt: formatCents(availableCash),
      availablePromotionCredit: formatCents(availablePromotion),
      availableSettlementAmount: formatCents(available.amount),
      availableDirection: available.direction,
      allocatedNetAmount: formatCents(allocated.amount),
      allocatedDirection: allocated.direction,
      allocatedPromotionCredit: formatCents(allocatedPromotion),
      heldCommissionAmount: this.decimal(row?.heldCommission),
      currency: 'PEN',
      asOf: now,
    };
  }

  private async list(
    query: SettlementQueryDto,
    driverProfileId?: string,
  ): Promise<DriverSettlementListResponseDto> {
    const builder = this.dataSource
      .getRepository(DriverSettlement)
      .createQueryBuilder('settlement');
    this.applyFilters(builder, query, driverProfileId);
    const [items, total] = await builder
      .orderBy('settlement.createdAt', 'DESC')
      .addOrderBy('settlement.id', 'DESC')
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

  private async detail(
    settlementId: string,
    driverProfileId?: string,
  ): Promise<DriverSettlementDetailResponseDto> {
    const settlement = await this.dataSource
      .getRepository(DriverSettlement)
      .findOne({
        where: {
          id: settlementId,
          ...(driverProfileId ? { driverProfileId } : {}),
        },
      });
    if (!settlement) throw new NotFoundException('La liquidacion no existe');
    const items = await this.dataSource
      .getRepository(DriverSettlementItem)
      .find({
        where: { settlementId },
        order: { accruedAt: 'ASC', id: 'ASC' },
      });
    return this.mapDetail(settlement, items);
  }

  private calculateTotals(commissions: RideCommission[]): SettlementTotals {
    let grossFareCents = 0n;
    let platformCommissionCents = 0n;
    let digitalNetCents = 0n;
    let cashCommissionCents = 0n;
    let promotionCreditCents = 0n;
    for (const commission of commissions) {
      grossFareCents += parseScaledDecimal(commission.baseAmount, 2);
      const commissionCents = parseScaledDecimal(
        commission.commissionAmount,
        2,
      );
      platformCommissionCents += commissionCents;
      if (
        commission.collectionMode ===
        CommissionCollectionMode.DEDUCT_FROM_PAYOUT
      ) {
        digitalNetCents += parseScaledDecimal(commission.driverNetAmount, 2);
      } else {
        cashCommissionCents += commissionCents;
        promotionCreditCents += parseScaledDecimal(
          commission.promotionCreditAmount ?? '0',
          2,
        );
      }
    }
    const signed = this.signedDirection(
      digitalNetCents + promotionCreditCents,
      cashCommissionCents,
    );
    return {
      grossFareCents,
      platformCommissionCents,
      digitalNetCents,
      cashCommissionCents,
      settlementCents: signed.amount,
      promotionCreditCents,
      direction: signed.direction,
    };
  }

  private signedDirection(
    digitalCents: bigint,
    cashCents: bigint,
  ): { direction: SettlementDirection; amount: bigint } {
    if (digitalCents > cashCents) {
      return {
        direction: SettlementDirection.PLATFORM_TO_DRIVER,
        amount: digitalCents - cashCents,
      };
    }
    if (cashCents > digitalCents) {
      return {
        direction: SettlementDirection.DRIVER_TO_PLATFORM,
        amount: cashCents - digitalCents,
      };
    }
    return { direction: SettlementDirection.BALANCED, amount: 0n };
  }

  private netEffect(commission: RideCommission): string {
    if (
      commission.collectionMode === CommissionCollectionMode.DEDUCT_FROM_PAYOUT
    ) {
      return commission.driverNetAmount;
    }
    const credit = parseScaledDecimal(
      commission.promotionCreditAmount ?? '0',
      2,
    );
    const debt = parseScaledDecimal(commission.commissionAmount, 2);
    return formatCents(credit - debt);
  }

  private validateIdempotencyKey(value: string | undefined): string {
    const normalized = value?.trim();
    if (!normalized || !IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw new BadRequestException(
        'Idempotency-Key debe tener entre 8 y 100 caracteres seguros',
      );
    }
    return normalized;
  }

  private validatePeriod(dto: CreateDriverSettlementDto): {
    periodStart: Date;
    periodEnd: Date;
  } {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (
      !Number.isFinite(periodStart.getTime()) ||
      !Number.isFinite(periodEnd.getTime()) ||
      periodEnd <= periodStart
    ) {
      throw new BadRequestException('El periodo de liquidacion no es valido');
    }
    if (periodEnd.getTime() > Date.now()) {
      throw new BadRequestException(
        'El periodo no puede terminar en el futuro',
      );
    }
    if (
      periodEnd.getTime() - periodStart.getTime() >
      MAX_SETTLEMENT_PERIOD_MS
    ) {
      throw new BadRequestException(
        'El periodo de liquidacion no puede superar 31 dias',
      );
    }
    return { periodStart, periodEnd };
  }

  private assertSameRequest(
    existing: DriverSettlement,
    dto: CreateDriverSettlementDto,
    periodStart: Date,
    periodEnd: Date,
  ): void {
    if (
      existing.driverProfileId !== dto.driverProfileId ||
      existing.periodStart.getTime() !== periodStart.getTime() ||
      existing.periodEnd.getTime() !== periodEnd.getTime()
    ) {
      throw new ConflictException(
        'Idempotency-Key ya fue usado con otros parametros',
      );
    }
  }

  private applyFilters(
    builder: SelectQueryBuilder<DriverSettlement>,
    query: SettlementQueryDto,
    driverProfileId?: string,
  ): void {
    if (driverProfileId) {
      builder.andWhere('settlement.driverProfileId = :driverProfileId', {
        driverProfileId,
      });
    }
    if (query.status) {
      builder.andWhere('settlement.status = :status', { status: query.status });
    }
    if (query.direction) {
      builder.andWhere('settlement.direction = :direction', {
        direction: query.direction,
      });
    }
    if (query.dateFrom) {
      builder.andWhere('settlement.createdAt >= :dateFrom', {
        dateFrom: new Date(query.dateFrom),
      });
    }
    if (query.dateTo) {
      builder.andWhere('settlement.createdAt < :dateTo', {
        dateTo: new Date(query.dateTo),
      });
    }
  }

  private async advisoryLock(
    manager: EntityManager,
    key: string,
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
  }

  private async lockSettlement(
    manager: EntityManager,
    settlementId: string,
  ): Promise<DriverSettlement> {
    const settlement = await manager.getRepository(DriverSettlement).findOne({
      where: { id: settlementId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!settlement) throw new NotFoundException('La liquidacion no existe');
    return settlement;
  }

  private async driverById(
    manager: EntityManager,
    driverProfileId: string,
  ): Promise<DriverProfile> {
    const driver = await manager.getRepository(DriverProfile).findOne({
      where: { id: driverProfileId },
    });
    if (!driver) throw new NotFoundException('El conductor no existe');
    return driver;
  }

  private async driverByUserId(userId: string): Promise<DriverProfile> {
    const driver = await this.dataSource.getRepository(DriverProfile).findOne({
      where: { userId },
    });
    if (!driver) throw new NotFoundException('El perfil no existe');
    return driver;
  }

  private enqueueSettlementEvent(
    manager: EntityManager,
    settlement: DriverSettlement,
    driverUserId: string,
    eventType: OutboxEventType,
    occurredAt: Date,
  ): Promise<unknown> {
    return this.outboxService.enqueueWithinTransaction(manager, {
      aggregateType: 'DRIVER_SETTLEMENT',
      aggregateId: settlement.id,
      eventType,
      payload: {
        settlementId: settlement.id,
        driverUserId,
        status: settlement.status,
        direction: settlement.direction,
        amount: settlement.settlementAmount,
        currency: settlement.currency,
        occurredAt: occurredAt.toISOString(),
      },
    });
  }

  private appendNotes(
    current: string | null,
    addition?: string,
  ): string | null {
    const normalized = addition?.trim();
    if (!normalized) return current;
    return current ? `${current}\n${normalized}`.slice(0, 1000) : normalized;
  }

  private map(settlement: DriverSettlement): DriverSettlementResponseDto {
    return {
      id: settlement.id,
      driverProfileId: settlement.driverProfileId,
      status: settlement.status,
      direction: settlement.direction,
      periodStart: settlement.periodStart,
      periodEnd: settlement.periodEnd,
      currency: settlement.currency,
      rideCount: settlement.rideCount,
      grossFareAmount: settlement.grossFareAmount,
      platformCommissionAmount: settlement.platformCommissionAmount,
      digitalNetAmount: settlement.digitalNetAmount,
      cashCommissionAmount: settlement.cashCommissionAmount,
      settlementAmount: settlement.settlementAmount,
      promotionCreditAmount: settlement.promotionCreditAmount,
      createdByAdminUserId: settlement.createdByAdminUserId,
      approvedByAdminUserId: settlement.approvedByAdminUserId,
      settledByAdminUserId: settlement.settledByAdminUserId,
      cancelledByAdminUserId: settlement.cancelledByAdminUserId,
      transferReference: settlement.transferReference,
      notes: settlement.notes,
      approvedAt: settlement.approvedAt,
      settledAt: settlement.settledAt,
      cancelledAt: settlement.cancelledAt,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
    };
  }

  private mapDetail(
    settlement: DriverSettlement,
    items: DriverSettlementItem[],
  ): DriverSettlementDetailResponseDto {
    return {
      ...this.map(settlement),
      items: items.map((item) => this.mapItem(item)),
    };
  }

  private mapItem(item: DriverSettlementItem): DriverSettlementItemResponseDto {
    return {
      id: item.id,
      commissionId: item.commissionId,
      rideId: item.rideId,
      collectionMode: item.collectionMode,
      baseAmount: item.baseAmount,
      commissionAmount: item.commissionAmount,
      driverNetAmount: item.driverNetAmount,
      netEffectAmount: item.netEffectAmount,
      promotionCreditAmount: item.promotionCreditAmount,
      currency: item.currency,
      accruedAt: item.accruedAt,
      releasedAt: item.releasedAt,
    };
  }

  private decimal(value: string | undefined): string {
    return formatCents(parseScaledDecimal(value ?? '0', 2));
  }
}
