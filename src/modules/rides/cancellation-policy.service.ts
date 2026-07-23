import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';

import { CancellationPolicy } from './entities/cancellation-policy.entity';
import type { CancellationPolicySnapshot } from './interfaces/cancellation-policy-snapshot.interface';

@Injectable()
export class CancellationPolicyService {
  constructor(private readonly configService: ConfigService) {}

  async getActiveSnapshot(
    manager: EntityManager,
    at: Date,
  ): Promise<CancellationPolicySnapshot> {
    const policy = await manager
      .getRepository(CancellationPolicy)
      .createQueryBuilder('policy')
      .where('policy.is_active = true')
      .andWhere('policy.effective_from <= :at', { at })
      .andWhere(
        '(policy.effective_until IS NULL OR policy.effective_until > :at)',
        { at },
      )
      .orderBy('policy.effective_from', 'DESC')
      .addOrderBy('policy.created_at', 'DESC')
      .setLock('pessimistic_read')
      .getOne();

    if (!policy) {
      return this.fallbackSnapshot();
    }

    return {
      policyId: policy.id,
      gracePeriodSeconds: policy.passengerGracePeriodSeconds,
      assignedFee: policy.passengerAssignedFee,
      arrivingFee: policy.passengerArrivingFee,
      arrivedFee: policy.passengerArrivedFee,
      passengerNoShowFee: policy.passengerNoShowFee,
      driverNoShowCompensation: policy.driverNoShowCompensation,
      driverArrivalWaitSeconds: policy.driverArrivalWaitSeconds,
      driverNoProgressSeconds: policy.driverNoProgressSeconds,
      driverNoProgressMinMeters: policy.driverNoProgressMinMeters,
      currency: policy.currency,
    };
  }

  fallbackSnapshot(): CancellationPolicySnapshot {
    return {
      policyId: null,
      gracePeriodSeconds: this.configService.get<number>(
        'PASSENGER_CANCELLATION_GRACE_SECONDS',
        60,
      ),
      assignedFee: this.configService.get<string>(
        'CANCELLATION_FEE_ASSIGNED_PEN',
        '1.00',
      ),
      arrivingFee: this.configService.get<string>(
        'CANCELLATION_FEE_ARRIVING_PEN',
        '1.50',
      ),
      arrivedFee: this.configService.get<string>(
        'CANCELLATION_FEE_ARRIVED_PEN',
        '2.00',
      ),
      passengerNoShowFee: this.configService.get<string>(
        'PASSENGER_NO_SHOW_FEE_PEN',
        '2.50',
      ),
      driverNoShowCompensation: this.configService.get<string>(
        'DRIVER_NO_SHOW_COMPENSATION_PEN',
        '1.50',
      ),
      driverArrivalWaitSeconds: this.configService.get<number>(
        'PASSENGER_NO_SHOW_WAIT_SECONDS',
        300,
      ),
      driverNoProgressSeconds: this.configService.get<number>(
        'DRIVER_NO_PROGRESS_SECONDS',
        180,
      ),
      driverNoProgressMinMeters: this.configService.get<number>(
        'DRIVER_NO_PROGRESS_MIN_METERS',
        100,
      ),
      currency: 'PEN',
    };
  }
}
