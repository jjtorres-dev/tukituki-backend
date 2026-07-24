import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, IsNull, LessThanOrEqual, MoreThan } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { CommissionPolicyResponseDto } from './dto/commission-response.dto';
import { UpdateCommissionPolicyDto } from './dto/update-commission-policy.dto';
import { CommissionPolicy } from './entities/commission-policy.entity';
import type { CommissionPolicySnapshot } from './interfaces/commission-policy-snapshot.interface';

@Injectable()
export class CommissionPolicyService {
  constructor(private readonly dataSource: DataSource) {}

  async getActiveSnapshot(
    manager: EntityManager,
    at: Date,
  ): Promise<CommissionPolicySnapshot> {
    const policy = await manager.getRepository(CommissionPolicy).findOne({
      where: [
        {
          effectiveFrom: LessThanOrEqual(at),
          effectiveUntil: IsNull(),
        },
        {
          effectiveFrom: LessThanOrEqual(at),
          effectiveUntil: MoreThan(at),
        },
      ],
      order: { effectiveFrom: 'DESC' },
      lock: { mode: 'pessimistic_read' },
    });
    if (!policy) {
      throw new ServiceUnavailableException(
        'No existe una política de comisión vigente',
      );
    }
    return { policyId: policy.id, rateBps: policy.rateBps };
  }

  async getCurrent(): Promise<CommissionPolicyResponseDto> {
    const now = new Date();
    const policy = await this.dataSource
      .getRepository(CommissionPolicy)
      .findOne({
        where: [
          { effectiveFrom: LessThanOrEqual(now), effectiveUntil: IsNull() },
          {
            effectiveFrom: LessThanOrEqual(now),
            effectiveUntil: MoreThan(now),
          },
        ],
        order: { effectiveFrom: 'DESC' },
      });
    if (!policy) {
      throw new ServiceUnavailableException(
        'No existe una política de comisión vigente',
      );
    }
    return this.map(policy);
  }

  async replaceCurrent(
    adminUserId: string,
    dto: UpdateCommissionPolicyDto,
  ): Promise<CommissionPolicyResponseDto> {
    const rateBps = this.percentToBps(dto.ratePercent);
    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException(
        'El motivo debe contener al menos 10 caracteres utiles',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'tukituki_commission_policy',
      ]);

      const repository = manager.getRepository(CommissionPolicy);
      const current = await repository.findOne({
        where: { effectiveUntil: IsNull() },
        order: { effectiveFrom: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (current?.rateBps === rateBps) return this.map(current);

      const now = new Date();
      if (current) {
        current.effectiveUntil = now;
        await repository.save(current);
      }
      const policy = repository.create({
        code: `TUKITUKI_${rateBps}BPS_${now.getTime()}`,
        name: `Comisión TukiTuki ${(rateBps / 100).toFixed(2)}%`,
        rateBps,
        effectiveFrom: now,
        effectiveUntil: null,
        createdByAdminUserId: adminUserId,
        reason,
      });
      return this.map(await repository.save(policy));
    });
  }

  private percentToBps(value: string): number {
    const numeric = Number(value);
    const scaled = numeric * 100;
    const rateBps = Math.round(scaled);
    if (
      !Number.isFinite(numeric) ||
      rateBps < 300 ||
      rateBps > 500 ||
      Math.abs(scaled - rateBps) > 1e-8
    ) {
      throw new BadRequestException('La comision debe estar entre 3% y 5%');
    }
    return rateBps;
  }

  private map(policy: CommissionPolicy): CommissionPolicyResponseDto {
    return {
      id: policy.id,
      code: policy.code,
      name: policy.name,
      rateBps: policy.rateBps,
      ratePercent: (policy.rateBps / 100).toFixed(2),
      effectiveFrom: policy.effectiveFrom,
      effectiveUntil: policy.effectiveUntil,
      reason: policy.reason,
    };
  }
}
