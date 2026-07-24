import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

import { NotificationEventHandler } from './notification-event.handler';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly lockTimeoutSeconds: number;
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID()}`;

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private shuttingDown = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
    private readonly handler: NotificationEventHandler,
  ) {
    this.enabled = this.configService.get<boolean>('WORKERS_ENABLED', true);

    this.intervalMs = this.configService.get<number>(
      'OUTBOX_POLL_INTERVAL_MS',
      1000,
    );

    this.batchSize = this.configService.get<number>('OUTBOX_BATCH_SIZE', 20);

    this.maxAttempts = this.configService.get<number>('OUTBOX_MAX_ATTEMPTS', 8);

    this.lockTimeoutSeconds = this.configService.get<number>(
      'OUTBOX_LOCK_TIMEOUT_SECONDS',
      60,
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Worker de outbox desactivado por configuración');
      return;
    }

    this.shuttingDown = false;

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    this.timer.unref();

    void this.tick();

    this.logger.log(
      `Worker de outbox iniciado cada ${this.intervalMs} ms con lote ${this.batchSize}`,
    );
  }

  onApplicationShutdown(): void {
    this.shuttingDown = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.logger.log('Worker de outbox detenido');
  }

  async runOnce(): Promise<number> {
    if (this.shuttingDown) {
      return 0;
    }

    const events = await this.outboxService.claimBatch(
      this.workerId,
      this.batchSize,
      this.lockTimeoutSeconds,
    );

    if (this.shuttingDown) {
      return 0;
    }

    for (const event of events) {
      if (this.shuttingDown) {
        break;
      }

      try {
        await this.handler.handle(event);

        if (this.shuttingDown) {
          break;
        }

        await this.outboxService.markProcessed(event.id, this.workerId);
      } catch (error: unknown) {
        if (this.shuttingDown) {
          break;
        }

        await this.outboxService.markFailed(
          event,
          this.workerId,
          error,
          this.maxAttempts,
        );

        this.logger.warn(
          `Evento ${event.id} (${event.eventType}) falló: ${this.errorMessage(error)}`,
        );
      }
    }

    return events.length;
  }

  private async tick(): Promise<void> {
    if (this.running || this.shuttingDown) {
      return;
    }

    this.running = true;

    try {
      await this.runOnce();
    } catch (error: unknown) {
      if (!this.shuttingDown) {
        this.logger.error(
          `El ciclo del outbox falló: ${this.errorMessage(error)}`,
        );
      }
    } finally {
      this.running = false;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
