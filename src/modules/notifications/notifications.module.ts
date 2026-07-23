import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { UserDevice } from './entities/user-device.entity';
import { UserNotification } from './entities/user-notification.entity';
import { FcmPushService } from './fcm-push.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { UserDevicesService } from './user-devices.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserDevice, UserNotification]),
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [NotificationsController],
  providers: [FcmPushService, UserDevicesService, NotificationsService],
  exports: [FcmPushService, UserDevicesService, NotificationsService],
})
export class NotificationsModule {}
