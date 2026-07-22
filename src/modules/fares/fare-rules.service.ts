import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';

import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../service-zones/enums/service-zone-status.enum';
import { CreateFareRuleDto } from './dto/create-fare-rule.dto';
import {
  FareRuleListResponseDto,
  FareRuleResponseDto,
} from './dto/fare-rule-response.dto';
import { FareRuleQueryDto } from './dto/fare-rule-query.dto';
import { UpdateFareRuleDto } from './dto/update-fare-rule.dto';
import { FareRule } from './entities/fare-rule.entity';
import { FareRuleStatus } from './enums/fare-rule-status.enum';
import { parseScaledDecimal } from './utils/fixed-decimal.util';

@Injectable()
export class FareRulesService {
  constructor(private readonly dataSource: DataSource) {}

  create(dto: CreateFareRuleDto): Promise<FareRuleResponseDto> {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveUntil = dto.effectiveUntil
      ? new Date(dto.effectiveUntil)
      : null;

    this.assertWindow(effectiveFrom, effectiveUntil);
    this.assertFareValues(dto);

    return this.dataSource.transaction(async (manager) => {
      const zoneRepository = manager.getRepository(ServiceZone);
      const fareRuleRepository = manager.getRepository(FareRule);
      const zone = await this.lockZone(zoneRepository, dto.serviceZoneId);

      const fareRule = fareRuleRepository.create({
        serviceZoneId: zone.id,
        serviceZone: zone,
        name: dto.name,
        baseFare: this.normalizeDecimal(dto.baseFare, 2),
        minimumFare: this.normalizeDecimal(dto.minimumFare, 2),
        pricePerKm: this.normalizeDecimal(dto.pricePerKm, 4),
        pricePerMinute: this.normalizeDecimal(dto.pricePerMinute, 4),
        bookingFee: this.normalizeDecimal(dto.bookingFee, 2),
        waitingPricePerMinute: this.normalizeDecimal(
          dto.waitingPricePerMinute,
          4,
        ),
        cancellationFee: this.normalizeDecimal(dto.cancellationFee, 2),
        nightMultiplier: this.normalizeDecimal(dto.nightMultiplier, 3),
        rainMultiplier: this.normalizeDecimal(dto.rainMultiplier, 3),
        currency: 'PEN',
        status: FareRuleStatus.DRAFT,
        effectiveFrom,
        effectiveUntil,
      });

      const savedRule = await fareRuleRepository.save(fareRule);

      savedRule.serviceZone = zone;

      return this.mapFareRule(savedRule);
    });
  }

  async list(query: FareRuleQueryDto): Promise<FareRuleListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.dataSource
      .getRepository(FareRule)
      .createQueryBuilder('rule')
      .leftJoinAndSelect('rule.serviceZone', 'zone');

    if (query.serviceZoneId) {
      queryBuilder.andWhere('rule.service_zone_id = :serviceZoneId', {
        serviceZoneId: query.serviceZoneId,
      });
    }

    if (query.status !== undefined) {
      queryBuilder.andWhere('rule.status = :status', {
        status: query.status,
      });
    }

    if (query.activeAt) {
      const activeAt = new Date(query.activeAt);

      queryBuilder
        .andWhere('rule.status = :activeStatus', {
          activeStatus: FareRuleStatus.ACTIVE,
        })
        .andWhere('rule.effective_from <= :activeAt', {
          activeAt,
        })
        .andWhere(
          '(rule.effective_until IS NULL OR rule.effective_until > :activeAt)',
          {
            activeAt,
          },
        );
    }

    const [rules, total] = await queryBuilder
      .orderBy('rule.effective_from', 'DESC')
      .addOrderBy('rule.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: rules.map((rule) => this.mapFareRule(rule)),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getById(fareRuleId: string): Promise<FareRuleResponseDto> {
    const fareRule = await this.dataSource.getRepository(FareRule).findOne({
      where: {
        id: fareRuleId,
      },
      relations: {
        serviceZone: true,
      },
    });

    if (!fareRule) {
      throw new NotFoundException('La regla tarifaria no existe');
    }

    return this.mapFareRule(fareRule);
  }

  update(
    fareRuleId: string,
    dto: UpdateFareRuleDto,
  ): Promise<FareRuleResponseDto> {
    this.assertFareValues(dto);

    return this.dataSource.transaction(async (manager) => {
      const fareRuleRepository = manager.getRepository(FareRule);
      const zoneRepository = manager.getRepository(ServiceZone);
      const initialRule = await fareRuleRepository.findOne({
        where: {
          id: fareRuleId,
        },
      });

      if (!initialRule) {
        throw new NotFoundException('La regla tarifaria no existe');
      }

      const zone = await this.lockZone(
        zoneRepository,
        initialRule.serviceZoneId,
      );
      const fareRule = await this.lockFareRule(fareRuleRepository, fareRuleId);

      this.applyUpdate(fareRule, dto);
      this.assertWindow(fareRule.effectiveFrom, fareRule.effectiveUntil);

      if (fareRule.status === FareRuleStatus.ACTIVE) {
        this.assertZoneCanUseActiveFare(zone);
        await this.assertNoOverlappingActiveRule(fareRuleRepository, fareRule);
      }

      const savedRule = await fareRuleRepository.save(fareRule);

      savedRule.serviceZone = zone;

      return this.mapFareRule(savedRule);
    });
  }

  activate(fareRuleId: string): Promise<FareRuleResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const fareRuleRepository = manager.getRepository(FareRule);
      const zoneRepository = manager.getRepository(ServiceZone);
      const initialRule = await fareRuleRepository.findOne({
        where: {
          id: fareRuleId,
        },
      });

      if (!initialRule) {
        throw new NotFoundException('La regla tarifaria no existe');
      }

      const zone = await this.lockZone(
        zoneRepository,
        initialRule.serviceZoneId,
      );
      const fareRule = await this.lockFareRule(fareRuleRepository, fareRuleId);

      this.assertZoneCanUseActiveFare(zone);
      this.assertWindow(fareRule.effectiveFrom, fareRule.effectiveUntil);

      if (fareRule.effectiveUntil && fareRule.effectiveUntil <= new Date()) {
        throw new BadRequestException(
          'No puede activarse una regla cuyo periodo ya terminó',
        );
      }

      await this.assertNoOverlappingActiveRule(fareRuleRepository, fareRule);

      fareRule.status = FareRuleStatus.ACTIVE;

      const savedRule = await fareRuleRepository.save(fareRule);

      savedRule.serviceZone = zone;

      return this.mapFareRule(savedRule);
    });
  }

  deactivate(fareRuleId: string): Promise<FareRuleResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const fareRuleRepository = manager.getRepository(FareRule);
      const zoneRepository = manager.getRepository(ServiceZone);
      const initialRule = await fareRuleRepository.findOne({
        where: {
          id: fareRuleId,
        },
      });

      if (!initialRule) {
        throw new NotFoundException('La regla tarifaria no existe');
      }

      const zone = await this.lockZone(
        zoneRepository,
        initialRule.serviceZoneId,
      );
      const fareRule = await this.lockFareRule(fareRuleRepository, fareRuleId);

      fareRule.status = FareRuleStatus.INACTIVE;

      const savedRule = await fareRuleRepository.save(fareRule);

      savedRule.serviceZone = zone;

      return this.mapFareRule(savedRule);
    });
  }

  private async lockZone(
    repository: Repository<ServiceZone>,
    zoneId: string,
  ): Promise<ServiceZone> {
    const zone = await repository
      .createQueryBuilder('zone')
      .where('zone.id = :zoneId', {
        zoneId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!zone) {
      throw new NotFoundException('La zona de cobertura no existe');
    }

    return zone;
  }

  private async lockFareRule(
    repository: Repository<FareRule>,
    fareRuleId: string,
  ): Promise<FareRule> {
    const fareRule = await repository
      .createQueryBuilder('rule')
      .where('rule.id = :fareRuleId', {
        fareRuleId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!fareRule) {
      throw new NotFoundException('La regla tarifaria no existe');
    }

    return fareRule;
  }

  private assertZoneCanUseActiveFare(zone: ServiceZone): void {
    if (zone.status !== ServiceZoneStatus.ACTIVE) {
      throw new BadRequestException(
        'La zona debe estar activa antes de activar su tarifa',
      );
    }
  }

  private async assertNoOverlappingActiveRule(
    repository: Repository<FareRule>,
    fareRule: FareRule,
  ): Promise<void> {
    const overlappingRule = await repository
      .createQueryBuilder('rule')
      .where('rule.service_zone_id = :serviceZoneId', {
        serviceZoneId: fareRule.serviceZoneId,
      })
      .andWhere('rule.status = :status', {
        status: FareRuleStatus.ACTIVE,
      })
      .andWhere('rule.id <> :fareRuleId', {
        fareRuleId: fareRule.id,
      })
      .andWhere(
        `rule.effective_from < COALESCE(
          CAST(:effectiveUntil AS timestamptz),
          'infinity'::timestamptz
        )`,
        {
          effectiveUntil: fareRule.effectiveUntil,
        },
      )
      .andWhere(
        `COALESCE(
          rule.effective_until,
          'infinity'::timestamptz
        ) > :effectiveFrom`,
        {
          effectiveFrom: fareRule.effectiveFrom,
        },
      )
      .getOne();

    if (overlappingRule) {
      throw new ConflictException(
        'Ya existe una regla tarifaria activa que se superpone con ese periodo',
      );
    }
  }

  private applyUpdate(fareRule: FareRule, dto: UpdateFareRuleDto): void {
    if (dto.name !== undefined) {
      fareRule.name = dto.name;
    }

    if (dto.baseFare !== undefined) {
      fareRule.baseFare = this.normalizeDecimal(dto.baseFare, 2);
    }

    if (dto.minimumFare !== undefined) {
      fareRule.minimumFare = this.normalizeDecimal(dto.minimumFare, 2);
    }

    if (dto.pricePerKm !== undefined) {
      fareRule.pricePerKm = this.normalizeDecimal(dto.pricePerKm, 4);
    }

    if (dto.pricePerMinute !== undefined) {
      fareRule.pricePerMinute = this.normalizeDecimal(dto.pricePerMinute, 4);
    }

    if (dto.bookingFee !== undefined) {
      fareRule.bookingFee = this.normalizeDecimal(dto.bookingFee, 2);
    }

    if (dto.waitingPricePerMinute !== undefined) {
      fareRule.waitingPricePerMinute = this.normalizeDecimal(
        dto.waitingPricePerMinute,
        4,
      );
    }

    if (dto.cancellationFee !== undefined) {
      fareRule.cancellationFee = this.normalizeDecimal(dto.cancellationFee, 2);
    }

    if (dto.nightMultiplier !== undefined) {
      fareRule.nightMultiplier = this.normalizeDecimal(dto.nightMultiplier, 3);
    }

    if (dto.rainMultiplier !== undefined) {
      fareRule.rainMultiplier = this.normalizeDecimal(dto.rainMultiplier, 3);
    }

    if (dto.effectiveFrom !== undefined) {
      fareRule.effectiveFrom = new Date(dto.effectiveFrom);
    }

    if (dto.effectiveUntil !== undefined) {
      fareRule.effectiveUntil = dto.effectiveUntil
        ? new Date(dto.effectiveUntil)
        : null;
    }
  }

  private assertWindow(effectiveFrom: Date, effectiveUntil: Date | null): void {
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException('La fecha effectiveFrom no es válida');
    }

    if (
      effectiveUntil &&
      (Number.isNaN(effectiveUntil.getTime()) ||
        effectiveUntil <= effectiveFrom)
    ) {
      throw new BadRequestException(
        'effectiveUntil debe ser posterior a effectiveFrom',
      );
    }
  }

  private assertFareValues(dto: CreateFareRuleDto | UpdateFareRuleDto): void {
    const monetaryValues = [
      dto.baseFare,
      dto.minimumFare,
      dto.bookingFee,
      dto.cancellationFee,
    ].filter((value): value is string => value !== undefined);

    const rateValues = [
      dto.pricePerKm,
      dto.pricePerMinute,
      dto.waitingPricePerMinute,
    ].filter((value): value is string => value !== undefined);

    for (const value of monetaryValues) {
      parseScaledDecimal(value, 2);
    }

    for (const value of rateValues) {
      parseScaledDecimal(value, 4);
    }

    const multipliers = [dto.nightMultiplier, dto.rainMultiplier].filter(
      (value): value is string => value !== undefined,
    );

    for (const multiplier of multipliers) {
      const scaledMultiplier = parseScaledDecimal(multiplier, 3);

      if (scaledMultiplier < 1000n || scaledMultiplier > 5000n) {
        throw new BadRequestException(
          'Los multiplicadores deben estar entre 1.000 y 5.000',
        );
      }
    }
  }

  private normalizeDecimal(value: string, scale: number): string {
    const scaledValue = parseScaledDecimal(value, scale);
    const base = 10n ** BigInt(scale);
    const wholePart = scaledValue / base;
    const fractionPart = (scaledValue % base).toString().padStart(scale, '0');

    return `${wholePart}.${fractionPart}`;
  }

  private mapFareRule(fareRule: FareRule): FareRuleResponseDto {
    return {
      id: fareRule.id,
      serviceZoneId: fareRule.serviceZoneId,
      serviceZone: fareRule.serviceZone
        ? {
            id: fareRule.serviceZone.id,
            name: fareRule.serviceZone.name,
            code: fareRule.serviceZone.code,
          }
        : null,
      name: fareRule.name,
      baseFare: fareRule.baseFare,
      minimumFare: fareRule.minimumFare,
      pricePerKm: fareRule.pricePerKm,
      pricePerMinute: fareRule.pricePerMinute,
      bookingFee: fareRule.bookingFee,
      waitingPricePerMinute: fareRule.waitingPricePerMinute,
      cancellationFee: fareRule.cancellationFee,
      nightMultiplier: fareRule.nightMultiplier,
      rainMultiplier: fareRule.rainMultiplier,
      currency: fareRule.currency,
      status: fareRule.status,
      effectiveFrom: fareRule.effectiveFrom,
      effectiveUntil: fareRule.effectiveUntil,
      createdAt: fareRule.createdAt,
      updatedAt: fareRule.updatedAt,
    };
  }
}
