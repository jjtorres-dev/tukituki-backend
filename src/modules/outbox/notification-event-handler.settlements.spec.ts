import { DataSource } from 'typeorm';

import { NotificationsService } from '../notifications/notifications.service';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxEventType } from './enums/outbox-event-type.enum';
import { NotificationEventHandler } from './notification-event.handler';

const DRIVER_USER_ID = 'f544d52a-39e0-4da3-8861-6010355c5dba';
const SETTLEMENT_ID = '180e9971-69c7-4c0e-b550-0a92037dc040';

describe('NotificationEventHandler settlements', () => {
  it.each([
    OutboxEventType.DRIVER_SETTLEMENT_APPROVED,
    OutboxEventType.DRIVER_SETTLEMENT_SETTLED,
    OutboxEventType.DRIVER_SETTLEMENT_CANCELLED,
  ])('notifica %s con una ruta propia de liquidacion', async (eventType) => {
    const createAndDeliver = jest.fn(() => Promise.resolve({}));
    const handler = new NotificationEventHandler(
      {} as DataSource,
      {
        createAndDeliver,
      } as unknown as NotificationsService,
    );
    const event = Object.assign(new OutboxEvent(), {
      id: '79a5d41c-9af0-4de2-a620-e26ff3073282',
      aggregateId: SETTLEMENT_ID,
      eventType,
      payload: {
        settlementId: SETTLEMENT_ID,
        driverUserId: DRIVER_USER_ID,
        status: 'APPROVED',
        direction: 'PLATFORM_TO_DRIVER',
        amount: '93.00',
        currency: 'PEN',
      },
    });

    await handler.handle(event);

    expect(createAndDeliver).toHaveBeenCalledTimes(1);
    expect(createAndDeliver).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: DRIVER_USER_ID,
        data: {
          route: 'driver-settlement',
          settlementId: SETTLEMENT_ID,
          status: 'APPROVED',
          direction: 'PLATFORM_TO_DRIVER',
          amount: '93.00',
          currency: 'PEN',
        },
      }),
    );
  });

  it('ignora de forma segura un evento sin conductor', async () => {
    const createAndDeliver = jest.fn(() => Promise.resolve({}));
    const handler = new NotificationEventHandler(
      {} as DataSource,
      {
        createAndDeliver,
      } as unknown as NotificationsService,
    );
    const event = Object.assign(new OutboxEvent(), {
      id: '79a5d41c-9af0-4de2-a620-e26ff3073282',
      aggregateId: SETTLEMENT_ID,
      eventType: OutboxEventType.DRIVER_SETTLEMENT_SETTLED,
      payload: { settlementId: SETTLEMENT_ID },
    });

    await handler.handle(event);

    expect(createAndDeliver).not.toHaveBeenCalled();
  });
});
