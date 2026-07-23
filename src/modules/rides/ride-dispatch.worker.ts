import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { RIDE_OFFER_TTL_MS } from './ride-matching.constants';
import { RideDispatchService } from './ride-dispatch.service';

interface DueRideRow {
  id: string;
}

interface AdvisoryLockRow {
  locked: boolean;
}

@Injectable()
export class RideDispatchWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RideDispatchWorker.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly rideDispatchService: RideDispatchService,
  ) {
    this.enabled = this.configService.get<boolean>('WORKERS_ENABLED', true);
    this.intervalMs = this.configService.get<number>(
      'RIDE_DISPATCH_POLL_INTERVAL_MS',
      2000,
    );
    this.batchSize = this.configService.get<number>(
      'RIDE_DISPATCH_BATCH_SIZE',
      25,
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Worker de matching desactivado por configuración');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
    void this.tick();
    this.logger.log(
      `Worker de matching iniciado cada ${this.intervalMs} ms con lote ${this.batchSize}`,
    );
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<number> {
    const rows = await this.findDueRides();
    let processed = 0;

    for (const row of rows) {
      const handled = await this.withRideAdvisoryLock(row.id, async () => {
        await this.rideDispatchService.expirePendingOffers(row.id);
        await this.rideDispatchService.dispatchRide(row.id);
      });
      if (handled) processed += 1;
    }

    return processed;
  }

  private async findDueRides(): Promise<DueRideRow[]> {
    const result: unknown = await this.dataSource.query(
      `SELECT ride.id
       FROM rides ride
       WHERE ride.status = 'SEARCHING_DRIVER'
         AND (
           ride.search_expires_at <= NOW()
           OR EXISTS (
             SELECT 1
             FROM ride_offers expired_offer
             WHERE expired_offer.ride_id = ride.id
               AND expired_offer.status = 'OFFERED'
               AND expired_offer.expires_at <= NOW()
           )
           OR (
             ride.dispatch_round < 3
             AND NOT EXISTS (
               SELECT 1
               FROM ride_offers offer
               WHERE offer.ride_id = ride.id
                 AND offer.status = 'OFFERED'
                 AND offer.expires_at > NOW()
             )
             AND (
               ride.last_dispatch_at IS NULL
               OR ride.last_dispatch_at <= NOW() - ($2 * INTERVAL '1 millisecond')
             )
           )
         )
       ORDER BY ride.requested_at ASC
       LIMIT $1`,
      [this.batchSize, RIDE_OFFER_TTL_MS],
    );
    return result as DueRideRow[];
  }

  private async withRideAdvisoryLock(
    rideId: string,
    operation: () => Promise<void>,
  ): Promise<boolean> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const lockResult: unknown = await queryRunner.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS "locked"',
        [rideId],
      );
      const locked = Boolean((lockResult as AdvisoryLockRow[])[0]?.locked);
      if (!locked) return false;

      try {
        await operation();
        return true;
      } finally {
        await queryRunner.query(
          'SELECT pg_advisory_unlock(hashtext($1)) AS "unlocked"',
          [rideId],
        );
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error: unknown) {
      this.logger.error(
        `El ciclo del matching falló: ${this.errorMessage(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
