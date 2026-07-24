import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, Not } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { FareQuote } from '../fares/entities/fare-quote.entity';
import { FareQuoteStatus } from '../fares/enums/fare-quote-status.enum';
import {
  formatCents,
  parseScaledDecimal,
} from '../fares/utils/fixed-decimal.util';
import { Ride } from '../rides/entities/ride.entity';
import { RideStatus } from '../rides/enums/ride-status.enum';
import {
  CreatePromotionDto,
  PromotionQueryDto,
  UpdatePromotionDto,
} from './dto/promotion.dto';
import {
  PromotionListResponseDto,
  PromotionResponseDto,
  PromotionValidationResponseDto,
} from './dto/promotion-response.dto';
import { PromotionRedemption } from './entities/promotion-redemption.entity';
import { Promotion } from './entities/promotion.entity';
import { PromotionDiscountType } from './enums/promotion-discount-type.enum';
import { PromotionRedemptionStatus } from './enums/promotion-redemption-status.enum';
import { PromotionStatus } from './enums/promotion-status.enum';

export interface ReservedPromotion {
  code: string;
  discountAmount: string;
  passengerAmountDue: string;
}

@Injectable()
export class PromotionsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    adminUserId: string,
    dto: CreatePromotionDto,
  ): Promise<PromotionResponseDto> {
    const values = this.normalizedValues(dto);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Promotion);
      const duplicate = await repository.findOne({
        where: { code: values.code },
      });
      if (duplicate)
        throw new ConflictException('El codigo promocional ya existe');
      const saved = await repository.save(
        repository.create({
          ...values,
          createdByAdminUserId: adminUserId,
          updatedByAdminUserId: adminUserId,
        }),
      );
      return this.map(manager, saved);
    });
  }

  async update(
    adminUserId: string,
    promotionId: string,
    dto: UpdatePromotionDto,
  ): Promise<PromotionResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Promotion);
      const promotion = await repository.findOne({
        where: { id: promotionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!promotion) throw new NotFoundException('La promocion no existe');
      const usage = await manager.getRepository(PromotionRedemption).count({
        where: {
          promotionId,
          status: Not(PromotionRedemptionStatus.RELEASED),
        },
      });
      if (usage > 0 && this.changesFinancialRule(dto)) {
        throw new ConflictException(
          'Una promocion reservada no puede cambiar sus reglas financieras',
        );
      }
      const merged = this.normalizedValues({
        code: dto.code ?? promotion.code,
        name: dto.name ?? promotion.name,
        description: dto.description ?? promotion.description ?? undefined,
        discountType: dto.discountType ?? promotion.discountType,
        discountBps: dto.discountBps ?? promotion.discountBps ?? undefined,
        fixedAmount: dto.fixedAmount ?? promotion.fixedAmount ?? undefined,
        maximumDiscountAmount:
          dto.maximumDiscountAmount ??
          promotion.maximumDiscountAmount ??
          undefined,
        minimumFareAmount: dto.minimumFareAmount ?? promotion.minimumFareAmount,
        startsAt: dto.startsAt ?? promotion.startsAt.toISOString(),
        endsAt: dto.endsAt ?? promotion.endsAt.toISOString(),
        totalUsageLimit:
          dto.totalUsageLimit ?? promotion.totalUsageLimit ?? undefined,
        perPassengerLimit: dto.perPassengerLimit ?? promotion.perPassengerLimit,
        firstRideOnly: dto.firstRideOnly ?? promotion.firstRideOnly,
        status: dto.status ?? promotion.status,
      });
      if (merged.code !== promotion.code) {
        const duplicate = await repository.findOne({
          where: { code: merged.code },
        });
        if (duplicate && duplicate.id !== promotion.id) {
          throw new ConflictException('El codigo promocional ya existe');
        }
      }
      Object.assign(promotion, merged, { updatedByAdminUserId: adminUserId });
      return this.map(manager, await repository.save(promotion));
    });
  }

  async list(query: PromotionQueryDto): Promise<PromotionListResponseDto> {
    const repository = this.dataSource.getRepository(Promotion);
    const [promotions, total] = await repository.findAndCount({
      where: query.status ? { status: query.status } : {},
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: await Promise.all(
        promotions.map((item) => this.map(this.dataSource.manager, item)),
      ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async detail(promotionId: string): Promise<PromotionResponseDto> {
    const promotion = await this.dataSource.getRepository(Promotion).findOne({
      where: { id: promotionId },
    });
    if (!promotion) throw new NotFoundException('La promocion no existe');
    return this.map(this.dataSource.manager, promotion);
  }

  validateForQuote(
    passengerUserId: string,
    fareQuoteId: string,
    code: string,
  ): Promise<PromotionValidationResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const quote = await manager.getRepository(FareQuote).findOne({
        where: { id: fareQuoteId, passengerUserId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!quote) throw new NotFoundException('La cotizacion no existe');
      const now = new Date();
      if (
        quote.status !== FareQuoteStatus.ACTIVE ||
        quote.expiresAt.getTime() <= now.getTime()
      ) {
        throw new ConflictException('La cotizacion ya no esta disponible');
      }
      const promotion = await this.lockUsablePromotion(
        manager,
        passengerUserId,
        code,
        quote.currency,
        quote.estimatedFare,
        now,
        'pessimistic_read',
      );
      const discount = this.calculateDiscount(promotion, quote.estimatedFare);
      const fare = parseScaledDecimal(quote.estimatedFare, 2);
      return {
        code: promotion.code,
        estimatedFare: quote.estimatedFare,
        discountAmount: formatCents(discount),
        passengerAmountDue: formatCents(fare - discount),
        currency: quote.currency,
        expiresAt: quote.expiresAt,
      };
    });
  }

  async reserveWithinTransaction(
    manager: EntityManager,
    passengerUserId: string,
    rideId: string,
    code: string,
    estimatedFare: string,
    currency: string,
    now: Date,
  ): Promise<ReservedPromotion> {
    const existing = await manager.getRepository(PromotionRedemption).findOne({
      where: { rideId },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      const fare = parseScaledDecimal(existing.estimatedFare, 2);
      const discount = parseScaledDecimal(existing.estimatedDiscount, 2);
      return {
        code: existing.codeSnapshot,
        discountAmount: existing.estimatedDiscount,
        passengerAmountDue: formatCents(fare - discount),
      };
    }
    const promotion = await this.lockUsablePromotion(
      manager,
      passengerUserId,
      code,
      currency,
      estimatedFare,
      now,
      'pessimistic_write',
    );
    const discount = this.calculateDiscount(promotion, estimatedFare);
    const fare = parseScaledDecimal(estimatedFare, 2);
    const repository = manager.getRepository(PromotionRedemption);
    await repository.save(
      repository.create({
        promotionId: promotion.id,
        passengerUserId,
        rideId,
        codeSnapshot: promotion.code,
        discountType: promotion.discountType,
        discountBps: promotion.discountBps,
        fixedAmount: promotion.fixedAmount,
        maximumDiscountAmount: promotion.maximumDiscountAmount,
        estimatedFare,
        estimatedDiscount: formatCents(discount),
        finalFare: null,
        finalDiscount: null,
        currency,
        status: PromotionRedemptionStatus.RESERVED,
        reservedAt: now,
        appliedAt: null,
        releasedAt: null,
        releaseReason: null,
      }),
    );
    return {
      code: promotion.code,
      discountAmount: formatCents(discount),
      passengerAmountDue: formatCents(fare - discount),
    };
  }

  async finalizeWithinTransaction(
    manager: EntityManager,
    rideId: string,
    finalFare: string,
    now: Date,
  ): Promise<{ discountAmount: string; passengerAmountDue: string }> {
    const repository = manager.getRepository(PromotionRedemption);
    const redemption = await repository.findOne({
      where: { rideId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!redemption) {
      return { discountAmount: '0.00', passengerAmountDue: finalFare };
    }
    if (redemption.status === PromotionRedemptionStatus.RELEASED) {
      throw new ConflictException('El cupon del viaje fue liberado');
    }
    const discount = this.calculateSnapshotDiscount(redemption, finalFare);
    const fare = parseScaledDecimal(finalFare, 2);
    redemption.finalFare = finalFare;
    redemption.finalDiscount = formatCents(discount);
    redemption.status = PromotionRedemptionStatus.APPLIED;
    redemption.appliedAt ??= now;
    await repository.save(redemption);
    return {
      discountAmount: formatCents(discount),
      passengerAmountDue: formatCents(fare - discount),
    };
  }

  async releaseWithinTransaction(
    manager: EntityManager,
    rideId: string,
    reason: string,
    now: Date,
  ): Promise<void> {
    const repository = manager.getRepository(PromotionRedemption);
    const redemption = await repository.findOne({
      where: { rideId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !redemption ||
      redemption.status !== PromotionRedemptionStatus.RESERVED
    ) {
      return;
    }
    redemption.status = PromotionRedemptionStatus.RELEASED;
    redemption.releasedAt = now;
    redemption.releaseReason = reason.slice(0, 200);
    await repository.save(redemption);
  }

  private async lockUsablePromotion(
    manager: EntityManager,
    passengerUserId: string,
    rawCode: string,
    currency: string,
    fare: string,
    now: Date,
    lock: 'pessimistic_read' | 'pessimistic_write',
  ): Promise<Promotion> {
    const code = rawCode.trim().toUpperCase();
    const promotion = await manager
      .getRepository(Promotion)
      .createQueryBuilder('promotion')
      .where('promotion.code = :code', { code })
      .setLock(lock)
      .getOne();
    if (!promotion) throw new NotFoundException('El cupon no existe');
    if (
      promotion.status !== PromotionStatus.ACTIVE ||
      promotion.startsAt.getTime() > now.getTime() ||
      promotion.endsAt.getTime() <= now.getTime()
    ) {
      throw new ConflictException('El cupon no esta vigente');
    }
    if (promotion.currency !== currency) {
      throw new ConflictException('El cupon no corresponde a esta moneda');
    }
    if (
      parseScaledDecimal(fare, 2) <
      parseScaledDecimal(promotion.minimumFareAmount, 2)
    ) {
      throw new ConflictException('La tarifa no alcanza el minimo del cupon');
    }
    const statuses = [
      PromotionRedemptionStatus.RESERVED,
      PromotionRedemptionStatus.APPLIED,
    ];
    const redemptionRepository = manager.getRepository(PromotionRedemption);
    const [totalUses, passengerUses] = await Promise.all([
      redemptionRepository.count({
        where: { promotionId: promotion.id, status: In(statuses) },
      }),
      redemptionRepository.count({
        where: {
          promotionId: promotion.id,
          passengerUserId,
          status: In(statuses),
        },
      }),
    ]);
    if (
      promotion.totalUsageLimit !== null &&
      totalUses >= promotion.totalUsageLimit
    ) {
      throw new ConflictException('El cupon alcanzo su limite total');
    }
    if (passengerUses >= promotion.perPassengerLimit) {
      throw new ConflictException('Ya alcanzaste el limite de uso del cupon');
    }
    if (promotion.firstRideOnly) {
      const completed = await manager.getRepository(Ride).count({
        where: { passengerUserId, status: RideStatus.COMPLETED },
      });
      if (completed > 0) {
        throw new ConflictException(
          'El cupon es exclusivo para el primer viaje',
        );
      }
    }
    return promotion;
  }

  private calculateDiscount(promotion: Promotion, fare: string): bigint {
    return this.discount(
      promotion.discountType,
      promotion.discountBps,
      promotion.fixedAmount,
      promotion.maximumDiscountAmount,
      fare,
    );
  }

  private calculateSnapshotDiscount(
    redemption: PromotionRedemption,
    fare: string,
  ): bigint {
    return this.discount(
      redemption.discountType,
      redemption.discountBps,
      redemption.fixedAmount,
      redemption.maximumDiscountAmount,
      fare,
    );
  }

  private discount(
    type: PromotionDiscountType,
    bps: number | null,
    fixed: string | null,
    maximum: string | null,
    fareValue: string,
  ): bigint {
    const fare = parseScaledDecimal(fareValue, 2);
    let discount =
      type === PromotionDiscountType.PERCENTAGE
        ? (fare * BigInt(bps!) + 5_000n) / 10_000n
        : parseScaledDecimal(fixed!, 2);
    if (maximum) {
      const cap = parseScaledDecimal(maximum, 2);
      if (discount > cap) discount = cap;
    }
    return discount > fare ? fare : discount;
  }

  private normalizedValues(
    dto: CreatePromotionDto,
  ): Omit<
    Promotion,
    | 'id'
    | 'createdByAdminUserId'
    | 'updatedByAdminUserId'
    | 'createdByAdminUser'
    | 'updatedByAdminUser'
    | 'version'
    | 'createdAt'
    | 'updatedAt'
  > {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'La fecha final debe ser posterior al inicio',
      );
    }
    const percentage = dto.discountType === PromotionDiscountType.PERCENTAGE;
    if ((percentage && !dto.discountBps) || (!percentage && !dto.fixedAmount)) {
      throw new BadRequestException('La regla de descuento esta incompleta');
    }
    return {
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      discountType: dto.discountType,
      discountBps: percentage ? dto.discountBps! : null,
      fixedAmount: percentage
        ? null
        : formatCents(parseScaledDecimal(dto.fixedAmount!, 2)),
      maximumDiscountAmount: dto.maximumDiscountAmount
        ? formatCents(parseScaledDecimal(dto.maximumDiscountAmount, 2))
        : null,
      minimumFareAmount: formatCents(
        parseScaledDecimal(dto.minimumFareAmount ?? '0', 2),
      ),
      currency: 'PEN',
      startsAt,
      endsAt,
      totalUsageLimit: dto.totalUsageLimit ?? null,
      perPassengerLimit: dto.perPassengerLimit ?? 1,
      firstRideOnly: dto.firstRideOnly ?? false,
      status: dto.status ?? PromotionStatus.PAUSED,
    };
  }

  private changesFinancialRule(dto: UpdatePromotionDto): boolean {
    return [
      dto.discountType,
      dto.discountBps,
      dto.fixedAmount,
      dto.maximumDiscountAmount,
      dto.minimumFareAmount,
      dto.totalUsageLimit,
      dto.perPassengerLimit,
      dto.firstRideOnly,
    ].some((value) => value !== undefined);
  }

  private async map(
    manager: EntityManager,
    promotion: Promotion,
  ): Promise<PromotionResponseDto> {
    const repository = manager.getRepository(PromotionRedemption);
    const [reservedUses, appliedUses, releasedUses] = await Promise.all([
      repository.count({
        where: {
          promotionId: promotion.id,
          status: PromotionRedemptionStatus.RESERVED,
        },
      }),
      repository.count({
        where: {
          promotionId: promotion.id,
          status: PromotionRedemptionStatus.APPLIED,
        },
      }),
      repository.count({
        where: {
          promotionId: promotion.id,
          status: PromotionRedemptionStatus.RELEASED,
        },
      }),
    ]);
    return {
      id: promotion.id,
      code: promotion.code,
      name: promotion.name,
      description: promotion.description,
      discountType: promotion.discountType,
      discountBps: promotion.discountBps,
      fixedAmount: promotion.fixedAmount,
      maximumDiscountAmount: promotion.maximumDiscountAmount,
      minimumFareAmount: promotion.minimumFareAmount,
      currency: promotion.currency,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      totalUsageLimit: promotion.totalUsageLimit,
      perPassengerLimit: promotion.perPassengerLimit,
      firstRideOnly: promotion.firstRideOnly,
      status: promotion.status,
      reservedUses,
      appliedUses,
      releasedUses,
      createdAt: promotion.createdAt,
      updatedAt: promotion.updatedAt,
    };
  }
}
