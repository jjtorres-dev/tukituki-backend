import { DataSource } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Ride } from '../rides/entities/ride.entity';
import { RideStatus } from '../rides/enums/ride-status.enum';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxEventType } from './enums/outbox-event-type.enum';
import { NotificationEventHandler } from './notification-event.handler';

describe('NotificationEventHandler', () => {
  it('crea una notificación para el pasajero cuando se asigna conductor', async () => {
    const ride = Object.assign(new Ride(), {
      id: 'd55d9d47-2817-4b97-8ce7-c7e3bd1bbb29',
      passengerUserId: 'b4d77437-b65c-488d-ae3b-f019845f2c96',
      driverProfileId: '1cab7629-938d-4c15-a273-afd8a2274990',
      driverProfile: Object.assign(new DriverProfile(), {
        userId: '27715aac-79c9-432f-8553-2d239e203f12',
      }),
      status: RideStatus.DRIVER_ASSIGNED,
    });
    const findOne = jest.fn(() => Promise.resolve(ride));
    const repository = { findOne };
    const getRepository = jest.fn(() => repository);
    const dataSource = { getRepository } as unknown as DataSource;
    const createAndDeliver = jest.fn<
      ReturnType<NotificationsService['createAndDeliver']>,
      Parameters<NotificationsService['createAndDeliver']>
    >(() =>
      Promise.resolve(
        {} as Awaited<ReturnType<NotificationsService['createAndDeliver']>>,
      ),
    );
    const notificationsService = {
      createAndDeliver,
    } as unknown as NotificationsService;
    const handler = new NotificationEventHandler(
      dataSource,
      notificationsService,
    );
    const event = Object.assign(new OutboxEvent(), {
      id: '1ef80a1c-7615-4ef0-b854-a4e7db11fda7',
      aggregateId: ride.id,
      eventType: OutboxEventType.RIDE_ASSIGNED,
    });

    await handler.handle(event);

    expect(createAndDeliver).toHaveBeenCalledTimes(1);

    const notificationInput = createAndDeliver.mock.calls[0]?.[0];

    expect(notificationInput).toBeDefined();
    expect(notificationInput?.userId).toBe(ride.passengerUserId);
    expect(notificationInput?.data.rideId).toBe(ride.id);
  });

  it('no duplica la notificación genérica de una cancelación avanzada', async () => {
    const createAndDeliver = jest.fn<
      ReturnType<NotificationsService['createAndDeliver']>,
      Parameters<NotificationsService['createAndDeliver']>
    >();
    const handler = new NotificationEventHandler(
      {} as DataSource,
      { createAndDeliver } as unknown as NotificationsService,
    );
    const event = Object.assign(new OutboxEvent(), {
      id: '00634ba5-bc50-480e-84df-45b354ac8c24',
      aggregateId: '2b0dfa36-f004-4376-81df-7d944782458d',
      eventType: OutboxEventType.RIDE_CANCELLED,
      payload: {
        metadata: {
          advancedCancellation: true,
        },
      },
    });

    await handler.handle(event);

    expect(createAndDeliver).not.toHaveBeenCalled();
  });

  it('notifica una obligación por tarifa de cancelación', async () => {
    let capturedInput:
      Parameters<NotificationsService['createAndDeliver']>[0] | undefined;
    const createAndDeliver = jest.fn<
      ReturnType<NotificationsService['createAndDeliver']>,
      Parameters<NotificationsService['createAndDeliver']>
    >((input) => {
      capturedInput = input;
      return Promise.resolve(
        {} as Awaited<ReturnType<NotificationsService['createAndDeliver']>>,
      );
    });
    const handler = new NotificationEventHandler(
      {} as DataSource,
      { createAndDeliver } as unknown as NotificationsService,
    );
    const userId = '54c6fe0d-ea8a-4aa9-9952-a82b70d88b7b';
    const rideId = 'e13d56a5-af46-426e-b86f-16ee2db48dc8';
    const event = Object.assign(new OutboxEvent(), {
      id: '2f250727-64de-465d-af51-194ae877718a',
      aggregateId: rideId,
      eventType: OutboxEventType.CANCELLATION_FEE_CREATED,
      payload: {
        userId,
        amount: '2.00',
        currency: 'PEN',
      },
    });

    await handler.handle(event);

    expect(capturedInput).toBeDefined();
    expect(capturedInput?.userId).toBe(userId);
    expect(capturedInput?.body).toBe(
      'Se registró una obligación pendiente de PEN 2.00.',
    );
    expect(capturedInput?.data.rideId).toBe(rideId);
  });
});
