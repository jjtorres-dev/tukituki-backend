import { ConfigService } from '@nestjs/config';

import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxEventStatus } from './enums/outbox-event-status.enum';
import { OutboxEventType } from './enums/outbox-event-type.enum';
import { NotificationEventHandler } from './notification-event.handler';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';

function event(): OutboxEvent {
  return Object.assign(new OutboxEvent(), {
    id: 'b4f49bfa-f76f-4e47-904e-7d080b51c995',
    aggregateType: 'RIDE',
    aggregateId: '36ad1131-b222-44fd-9bc6-2afdb797fa5e',
    eventType: OutboxEventType.RIDE_ASSIGNED,
    payload: {},
    status: OutboxEventStatus.PROCESSING,
    attempts: 1,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: 'worker',
    processedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('OutboxWorker', () => {
  const configService = {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  } as unknown as ConfigService;

  it('procesa y confirma los eventos reclamados', async () => {
    const item = event();
    const claimBatch = jest.fn(() => Promise.resolve([item]));
    const markProcessed = jest.fn(() => Promise.resolve());
    const markFailed = jest.fn(() => Promise.resolve());
    const handle = jest.fn(() => Promise.resolve());
    const outboxService = {
      claimBatch,
      markProcessed,
      markFailed,
    } as unknown as OutboxService;
    const handler = { handle } as unknown as NotificationEventHandler;
    const worker = new OutboxWorker(configService, outboxService, handler);

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(handle).toHaveBeenCalledWith(item);
    expect(markProcessed).toHaveBeenCalledWith(item.id, expect.any(String));
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('reprograma el evento cuando el manejador falla', async () => {
    const item = event();
    const failure = new Error('fallo simulado');
    const claimBatch = jest.fn(() => Promise.resolve([item]));
    const markProcessed = jest.fn(() => Promise.resolve());
    const markFailed = jest.fn(() => Promise.resolve());
    const handle = jest.fn(() => Promise.reject(failure));
    const outboxService = {
      claimBatch,
      markProcessed,
      markFailed,
    } as unknown as OutboxService;
    const handler = { handle } as unknown as NotificationEventHandler;
    const worker = new OutboxWorker(configService, outboxService, handler);

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(markFailed).toHaveBeenCalledWith(
      item,
      expect.any(String),
      failure,
      8,
    );
  });
});
