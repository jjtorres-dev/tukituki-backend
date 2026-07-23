import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { RideOffer } from '../rides/entities/ride-offer.entity';
import { Ride } from '../rides/entities/ride.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { NotificationEventHandler } from './notification-event.handler';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent, Ride, RideOffer, DriverProfile]),
    NotificationsModule,
  ],
  providers: [OutboxService, NotificationEventHandler, OutboxWorker],
  exports: [OutboxService],
})
export class OutboxModule {}
