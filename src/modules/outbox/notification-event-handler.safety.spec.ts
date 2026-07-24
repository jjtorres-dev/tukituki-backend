import { DataSource } from 'typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Ride } from '../rides/entities/ride.entity';
import { RideSafetyIncident } from '../safety/entities/ride-safety-incident.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxEventType } from './enums/outbox-event-type.enum';
import { NotificationEventHandler } from './notification-event.handler';

describe('NotificationEventHandler safety regression', () => {
  it('procesa un SOS como incidente de seguridad y no como pago en efectivo', async () => {
    const ride = Object.assign(new Ride(), {
      id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
      passengerUserId: '2bb75614-f6d6-437f-b38f-e21aad622428',
      driverProfile: Object.assign(new DriverProfile(), {
        userId: 'f544d52a-39e0-4da3-8861-6010355c5dba',
      }),
    });
    const incident = Object.assign(new RideSafetyIncident(), {
      id: '775b1230-cf1b-4818-bf8b-eaf2588662a1',
      rideId: ride.id,
      reporterUserId: ride.passengerUserId,
      severity: 'CRITICAL',
      ride,
    });
    const incidentRepository = {
      findOne: jest.fn(() => Promise.resolve(incident)),
    };
    const dataSource = {
      getRepository: jest.fn(() => incidentRepository),
      query: jest.fn(() =>
        Promise.resolve([{ id: '9e14cab8-2714-4cf9-8024-d6c97c8729ca' }]),
      ),
    } as unknown as DataSource;
    const createAndDeliver = jest.fn(() => Promise.resolve({}));
    const handler = new NotificationEventHandler(dataSource, {
      createAndDeliver,
    } as unknown as NotificationsService);
    const event = Object.assign(new OutboxEvent(), {
      id: '1ef80a1c-7615-4ef0-b854-a4e7db11fda7',
      aggregateId: incident.id,
      eventType: OutboxEventType.SAFETY_INCIDENT_CREATED,
      payload: {},
    });

    await handler.handle(event);

    expect(createAndDeliver).toHaveBeenCalledTimes(3);
    for (const [notification] of createAndDeliver.mock.calls) {
      expect(notification.type).toBe('SAFETY_INCIDENT');
      // The generic Jest mock does not preserve the notification input type.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(notification.data.incidentId).toBe(incident.id);
    }
  });
});
