import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ServiceZonesService } from '../service-zones/service-zones.service';
import { EstimateFareDto } from './dto/estimate-fare.dto';
import { FareEstimateResponseDto } from './dto/fare-estimate-response.dto';
import { FareRule } from './entities/fare-rule.entity';
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

@Injectable()
export class FaresService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly serviceZonesService: ServiceZonesService,
  ) {}

  async estimate(dto: EstimateFareDto): Promise<FareEstimateResponseDto> {
    this.assertRouteMetrics(dto.distanceMeters, dto.durationSeconds);

    const [originZone, destinationZone] = await Promise.all([
      this.serviceZonesService.findActiveZoneForPoint(
        dto.origin.latitude,
        dto.origin.longitude,
      ),
      this.serviceZonesService.findActiveZoneForPoint(
        dto.destination.latitude,
        dto.destination.longitude,
      ),
    ]);

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

    const fareRule = await this.dataSource
      .getRepository(FareRule)
      .createQueryBuilder('rule')
      .where('rule.service_zone_id = :serviceZoneId', {
        serviceZoneId: originZone.id,
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
      .getOne();

    if (!fareRule) {
      throw new BadRequestException(
        'No existe una regla tarifaria activa para la zona de origen',
      );
    }

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
      distanceMeters: dto.distanceMeters,
      durationSeconds: dto.durationSeconds,
      baseFare: formatCents(baseFareCents),
      distanceAmount: formatCents(distanceAmountCents),
      timeAmount: formatCents(timeAmountCents),
      bookingFee: formatCents(bookingFeeCents),
      subtotal: formatCents(subtotalCents),
      adjustmentMultiplier: formatScaledInteger(multiplierScaledThree, 3),
      estimatedFare: formatCents(estimatedFareCents),
      currency: fareRule.currency,
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
}
