import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxEventStatus } from './enums/outbox-event-status.enum';
import type { EnqueueOutboxEventInput } from './interfaces/enqueue-outbox-event.interface';

interface ClaimedOutboxRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: OutboxEvent['eventType'];
  payload: Record<string, unknown>;
  status: OutboxEventStatus;
  attempts: number;
  availableAt: Date | string;
  lockedAt: Date | string | null;
  lockedBy: string | null;
  processedAt: Date | string | null;
  lastError: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

@Injectable()
export class OutboxService {
  constructor(private readonly dataSource: DataSource) {}

  enqueueWithinTransaction(
    manager: EntityManager,
    input: EnqueueOutboxEventInput,
  ): Promise<OutboxEvent> {
    const repository = manager.getRepository(OutboxEvent);

    const event = repository.create({
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload ?? {},
      status: OutboxEventStatus.PENDING,
      attempts: 0,
      availableAt: input.availableAt ?? new Date(),
      lockedAt: null,
      lockedBy: null,
      processedAt: null,
      lastError: null,
    });

    return repository.save(event);
  }

  enqueue(input: EnqueueOutboxEventInput): Promise<OutboxEvent> {
    return this.dataSource.transaction((manager) =>
      this.enqueueWithinTransaction(manager, input),
    );
  }

  async claimBatch(
    workerId: string,
    batchSize: number,
    lockTimeoutSeconds: number,
  ): Promise<OutboxEvent[]> {
    const result: unknown = await this.dataSource.query(
      `WITH candidates AS (
         SELECT id
         FROM outbox_events
         WHERE (
           (
             status = 'PENDING'
             AND available_at <= NOW()
           )
           OR
           (
             status = 'PROCESSING'
             AND locked_at <= NOW() - ($3 * INTERVAL '1 second')
           )
         )
         AND NOT EXISTS (
           SELECT 1
           FROM outbox_events AS earlier
           WHERE earlier.aggregate_type = outbox_events.aggregate_type
             AND earlier.aggregate_id = outbox_events.aggregate_id
             AND earlier.created_at < outbox_events.created_at
             AND earlier.status NOT IN ('PROCESSED', 'DEAD')
         )
         ORDER BY available_at ASC, created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE outbox_events AS event
       SET status = 'PROCESSING',
           attempts = event.attempts + 1,
           locked_at = NOW(),
           locked_by = $2,
           updated_at = NOW()
       FROM candidates
       WHERE event.id = candidates.id
       RETURNING
         event.id AS "id",
         event.aggregate_type AS "aggregateType",
         event.aggregate_id AS "aggregateId",
         event.event_type AS "eventType",
         event.payload AS "payload",
         event.status AS "status",
         event.attempts AS "attempts",
         event.available_at AS "availableAt",
         event.locked_at AS "lockedAt",
         event.locked_by AS "lockedBy",
         event.processed_at AS "processedAt",
         event.last_error AS "lastError",
         event.created_at AS "createdAt",
         event.updated_at AS "updatedAt"`,
      [batchSize, workerId, lockTimeoutSeconds],
    );

    const rows = this.extractClaimedRows(result);

    return rows
      .filter((row) => typeof row.id === 'string' && row.id.length > 0)
      .map((row) => this.mapClaimedRow(row));
  }

  async markProcessed(eventId: string, workerId: string): Promise<void> {
    if (!eventId) {
      throw new Error(
        'No se puede marcar un evento outbox como procesado sin un ID.',
      );
    }

    if (!workerId) {
      throw new Error(
        'No se puede marcar un evento outbox como procesado sin workerId.',
      );
    }

    await this.dataSource.getRepository(OutboxEvent).update(
      {
        id: eventId,
        status: OutboxEventStatus.PROCESSING,
        lockedBy: workerId,
      },
      {
        status: OutboxEventStatus.PROCESSED,
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    );
  }

  async markFailed(
    event: OutboxEvent,
    workerId: string,
    error: unknown,
    maxAttempts: number,
  ): Promise<void> {
    if (!event.id) {
      throw new Error(
        'No se puede marcar un evento outbox como fallido sin un ID.',
      );
    }

    if (!workerId) {
      throw new Error(
        'No se puede marcar un evento outbox como fallido sin workerId.',
      );
    }

    const dead = event.attempts >= maxAttempts;

    const backoffSeconds = Math.min(3600, 2 ** Math.min(event.attempts, 10));

    await this.dataSource.getRepository(OutboxEvent).update(
      {
        id: event.id,
        status: OutboxEventStatus.PROCESSING,
        lockedBy: workerId,
      },
      {
        status: dead ? OutboxEventStatus.DEAD : OutboxEventStatus.PENDING,

        availableAt: dead
          ? event.availableAt
          : new Date(Date.now() + backoffSeconds * 1000),

        lockedAt: null,
        lockedBy: null,
        lastError: this.errorMessage(error).slice(0, 4000),
      },
    );
  }

  private extractClaimedRows(result: unknown): ClaimedOutboxRow[] {
    if (!Array.isArray(result)) {
      return [];
    }

    /*
     * Dependiendo de la versión de TypeORM y del driver de PostgreSQL,
     * DataSource.query() puede devolver:
     *
     * 1. Las filas directamente:
     *    [{ id: '...', ... }]
     *
     * 2. Una tupla con las filas y la cantidad afectada:
     *    [[{ id: '...', ... }], 1]
     *
     * Esta validación admite ambas formas.
     */
    if (result.length > 0 && Array.isArray(result[0])) {
      return result[0].filter((row): row is ClaimedOutboxRow =>
        this.isClaimedOutboxRow(row),
      );
    }

    return result.filter((row): row is ClaimedOutboxRow =>
      this.isClaimedOutboxRow(row),
    );
  }

  private isClaimedOutboxRow(value: unknown): value is ClaimedOutboxRow {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const row = value as Partial<ClaimedOutboxRow>;

    return (
      typeof row.id === 'string' &&
      row.id.length > 0 &&
      typeof row.aggregateType === 'string' &&
      typeof row.aggregateId === 'string' &&
      typeof row.eventType === 'string' &&
      typeof row.attempts === 'number'
    );
  }

  private mapClaimedRow(row: ClaimedOutboxRow): OutboxEvent {
    return Object.assign(new OutboxEvent(), {
      ...row,

      payload:
        row.payload && typeof row.payload === 'object' ? row.payload : {},

      availableAt: new Date(row.availableAt),

      lockedAt: row.lockedAt ? new Date(row.lockedAt) : null,

      processedAt: row.processedAt ? new Date(row.processedAt) : null,

      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
