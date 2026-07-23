import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../service-zones/enums/service-zone-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { EstimateFareDto } from './dto/estimate-fare.dto';
import { FareEstimateResponseDto } from './dto/fare-estimate-response.dto';
import { FareQuote } from './entities/fare-quote.entity';
import { FareRule } from './entities/fare-rule.entity';
import { FareQuoteStatus } from './enums/fare-quote-status.enum';
import { FareRuleStatus } from './enums/fare-rule-status.enum';
import {
  applyMultiplierToCents,
  calculateDistanceAmountCents,
  calculateTimeAmountCents,
  combineMultipliersScaledThree,
  formatCents,
  formatScaledInteger,
  parseScaledDecimal,
} from './utils/fixed-decimal.util';

const FARE_QUOTE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class FaresService {
  constructor(private readonly dataSource: DataSource) {}

  estimate(
    passengerUserId: string,
    dto: EstimateFareDto,
  ): Promise<FareEstimateResponseDto> {
    this.assertRouteMetrics(dto.distanceMeters, dto.durationSeconds);
    this.assertDifferentPoints(dto);

    return this.dataSource.transaction(async (manager) => {
      const passenger = await this.lockPassenger(manager, passengerUserId);

      this.assertPassengerEnabled(passenger);

      const originZone = await this.findActiveZoneForPoint(
        manager,
        dto.origin.latitude,
        dto.origin.longitude,
      );
      const destinationZone = await this.findActiveZoneForPoint(
        manager,
        dto.destination.latitude,
        dto.destination.longitude,
      );

      if (!originZone) {
        throw new BadRequestException(
          'El origen se encuentra fuera de la zona de cobertura',
        );
      }

      if (!destinationZone) {
        throw new BadRequestException(
          'El destino se encuentra fuera de la zona de cobertura',
        );
      }

      const now = new Date();
      const fareRule = await this.lockApplicableFareRule(
        manager,
        originZone.id,
        now,
      );

      if (!fareRule) {
        throw new BadRequestException(
          'No existe una regla tarifaria activa para la zona de origen',
        );
      }

      const amounts = this.calculateAmounts(fareRule, dto);
      const expiresAt = new Date(now.getTime() + FARE_QUOTE_TTL_MS);
      const quoteRepository = manager.getRepository(FareQuote);
      const quote = quoteRepository.create({
        passengerUserId,
        fareRuleId: fareRule.id,
        originZoneId: originZone.id,
        destinationZoneId: destinationZone.id,
        originPosition: {
          type: 'Point',
          coordinates: [dto.origin.longitude, dto.origin.latitude],
        },
        destinationPosition: {
          type: 'Point',
          coordinates: [dto.destination.longitude, dto.destination.latitude],
        },
        originAddress: dto.origin.address.trim(),
        destinationAddress: dto.destination.address.trim(),
        distanceMeters: dto.distanceMeters,
        durationSeconds: dto.durationSeconds,
        baseFare: amounts.baseFare,
        distanceAmount: amounts.distanceAmount,
        timeAmount: amounts.timeAmount,
        bookingFee: amounts.bookingFee,
        pricingMinimumFare: fareRule.minimumFare,
        pricingPricePerKm: fareRule.pricePerKm,
        pricingPricePerMinute: fareRule.pricePerMinute,
        pricingCalculationVersion: 'fixed-decimal-v1',
        subtotal: amounts.subtotal,
        adjustmentMultiplier: amounts.adjustmentMultiplier,
        estimatedFare: amounts.estimatedFare,
        currency: fareRule.currency,
        isNight: dto.isNight === true,
        isRaining: dto.isRaining === true,
        status: FareQuoteStatus.ACTIVE,
        expiresAt,
        usedAt: null,
      });
      const savedQuote = await quoteRepository.save(quote);

      return {
        quoteId: savedQuote.id,
        quoteStatus: savedQuote.status,
        fareRuleId: fareRule.id,
        originZone: {
          id: originZone.id,
          name: originZone.name,
          code: originZone.code,
        },
        destinationZone: {
          id: destinationZone.id,
          name: destinationZone.name,
          code: destinationZone.code,
        },
        origin: {
          latitude: dto.origin.latitude,
          longitude: dto.origin.longitude,
          address: savedQuote.originAddress,
        },
        destination: {
          latitude: dto.destination.latitude,
          longitude: dto.destination.longitude,
          address: savedQuote.destinationAddress,
        },
        distanceMeters: savedQuote.distanceMeters,
        durationSeconds: savedQuote.durationSeconds,
        baseFare: savedQuote.baseFare,
        distanceAmount: savedQuote.distanceAmount,
        timeAmount: savedQuote.timeAmount,
        bookingFee: savedQuote.bookingFee,
        subtotal: savedQuote.subtotal,
        adjustmentMultiplier: savedQuote.adjustmentMultiplier,
        estimatedFare: savedQuote.estimatedFare,
        currency: savedQuote.currency,
        expiresAt: savedQuote.expiresAt,
      };
    });
  }

  private async lockPassenger(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :userId', {
        userId,
      })
      .setLock('pessimistic_read')
      .getOne();

    if (!user) {
      throw new NotFoundException('El pasajero no existe');
    }

    return user;
  }

  private assertPassengerEnabled(user: User): void {
    if (
      user.status !== UserStatus.ACTIVE ||
      !user.isPhoneVerified ||
      !user.roles.includes(UserRole.PASSENGER)
    ) {
      throw new ForbiddenException('La cuenta del pasajero no está habilitada');
    }
  }

  private findActiveZoneForPoint(
    manager: EntityManager,
    latitude: number,
    longitude: number,
  ): Promise<ServiceZone | null> {
    return manager
      .getRepository(ServiceZone)
      .createQueryBuilder('zone')
      .where('zone.status = :status', {
        status: ServiceZoneStatus.ACTIVE,
      })
      .andWhere(
        `ST_Covers(
          zone.boundary,
          ST_SetSRID(
            ST_MakePoint(:longitude, :latitude),
            4326
          )::geography
        )`,
        {
          latitude,
          longitude,
        },
      )
      .orderBy('zone.priority', 'DESC')
      .addOrderBy('zone.created_at', 'ASC')
      .setLock('pessimistic_read')
      .getOne();
  }

  private lockApplicableFareRule(
    manager: EntityManager,
    serviceZoneId: string,
    now: Date,
  ): Promise<FareRule | null> {
    return manager
      .getRepository(FareRule)
      .createQueryBuilder('rule')
      .where('rule.service_zone_id = :serviceZoneId', {
        serviceZoneId,
      })
      .andWhere('rule.status = :status', {
        status: FareRuleStatus.ACTIVE,
      })
      .andWhere('rule.effective_from <= :now', {
        now,
      })
      .andWhere(
        '(rule.effective_until IS NULL OR rule.effective_until > :now)',
        {
          now,
        },
      )
      .orderBy('rule.effective_from', 'DESC')
      .setLock('pessimistic_read')
      .getOne();
  }

  private calculateAmounts(
    fareRule: FareRule,
    dto: EstimateFareDto,
  ): {
    baseFare: string;
    distanceAmount: string;
    timeAmount: string;
    bookingFee: string;
    subtotal: string;
    adjustmentMultiplier: string;
    estimatedFare: string;
  } {
    const baseFareCents = parseScaledDecimal(fareRule.baseFare, 2);
    const minimumFareCents = parseScaledDecimal(fareRule.minimumFare, 2);
    const bookingFeeCents = parseScaledDecimal(fareRule.bookingFee, 2);
    const distanceAmountCents = calculateDistanceAmountCents(
      fareRule.pricePerKm,
      dto.distanceMeters,
    );
    const timeAmountCents = calculateTimeAmountCents(
      fareRule.pricePerMinute,
      dto.durationSeconds,
    );
    const subtotalCents =
      baseFareCents + distanceAmountCents + timeAmountCents + bookingFeeCents;
    const multipliers: string[] = [];

    if (dto.isNight === true) {
      multipliers.push(fareRule.nightMultiplier);
    }

    if (dto.isRaining === true) {
      multipliers.push(fareRule.rainMultiplier);
    }

    const multiplierScaledThree = combineMultipliersScaledThree(multipliers);
    const adjustedCents = applyMultiplierToCents(
      subtotalCents,
      multiplierScaledThree,
    );
    const estimatedFareCents =
      adjustedCents > minimumFareCents ? adjustedCents : minimumFareCents;

    return {
      baseFare: formatCents(baseFareCents),
      distanceAmount: formatCents(distanceAmountCents),
      timeAmount: formatCents(timeAmountCents),
      bookingFee: formatCents(bookingFeeCents),
      subtotal: formatCents(subtotalCents),
      adjustmentMultiplier: formatScaledInteger(multiplierScaledThree, 3),
      estimatedFare: formatCents(estimatedFareCents),
    };
  }

  private assertRouteMetrics(
    distanceMeters: number,
    durationSeconds: number,
  ): void {
    if (
      !Number.isInteger(distanceMeters) ||
      distanceMeters < 1 ||
      distanceMeters > 100000
    ) {
      throw new BadRequestException(
        'La distancia debe estar entre 1 y 100000 metros',
      );
    }

    if (
      !Number.isInteger(durationSeconds) ||
      durationSeconds < 1 ||
      durationSeconds > 86400
    ) {
      throw new BadRequestException(
        'La duración debe estar entre 1 y 86400 segundos',
      );
    }
  }

  private assertDifferentPoints(dto: EstimateFareDto): void {
    if (
      dto.origin.latitude === dto.destination.latitude &&
      dto.origin.longitude === dto.destination.longitude
    ) {
      throw new BadRequestException(
        'El origen y el destino deben ser diferentes',
      );
    }
  }
}
