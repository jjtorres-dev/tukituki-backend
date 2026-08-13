import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { RIDE_DISPATCH_INTERVAL_MS } from './ride-matching.constants';
import { RideDispatchService } from './ride-dispatch.service';
import { withRideAdvisoryLock } from './ride-advisory-lock.util';

interface DueRideRow {
  id: string;
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
    private readonly availabilityRedisService: DriverAvailabilityRedisService,
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
      const { acquired } = await withRideAdvisoryLock(
        this.dataSource,
        row.id,
        async () => {
          await this.rideDispatchService.expirePendingOffers(row.id);
          await this.rideDispatchService.dispatchRide(row.id);
        },
      );
      if (acquired) processed += 1;
    }

    return processed;
  }

  /*
   * G3A - late-join matching.
   *
   * Drena (SPOP, atómico) la cola Redis de conductores que acaban
   * de volverse realmente descubribles (ver
   * DriverAvailabilityRedisService.registerDiscoverableTransition)
   * y ejecuta matching retroactivo para cada uno, usando el mismo
   * ritmo de polling que ya tiene este worker. Un fallo aislado en
   * un conductor no debe impedir procesar el resto del lote.
   */
  async runLateJoinOnce(): Promise<number> {
    const driverProfileIds =
      await this.availabilityRedisService.drainLateJoinPendingDrivers(
        this.batchSize,
      );
    let processed = 0;

    for (const driverProfileId of driverProfileIds) {
      try {
        await this.rideDispatchService.dispatchLateJoinDriver(driverProfileId);
        processed += 1;
      } catch (error: unknown) {
        this.logger.error(
          `El late-join matching falló para el conductor ${driverProfileId}: ${this.errorMessage(error)}`,
        );
      }
    }

    return processed;
  }

  /*
   * G3B1: una RideOffer OFFERED todavía viva ya NO impide que una
   * ride sea "due" para otra ronda (esa era la responsabilidad B
   * que RIDE_OFFER_TTL_MS mezclaba con la visibilidad del Driver).
   * La cadencia ahora depende únicamente de RIDE_DISPATCH_INTERVAL_MS
   * contado desde last_dispatch_at.
   */
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
             AND (
               ride.last_dispatch_at IS NULL
               OR ride.last_dispatch_at <= NOW() - ($2 * INTERVAL '1 millisecond')
             )
           )
         )
       ORDER BY ride.requested_at ASC
       LIMIT $1`,
      [this.batchSize, RIDE_DISPATCH_INTERVAL_MS],
    );
    return result as DueRideRow[];
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
    }

    try {
      await this.runLateJoinOnce();
    } catch (error: unknown) {
      this.logger.error(
        `El ciclo de late-join matching falló: ${this.errorMessage(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
