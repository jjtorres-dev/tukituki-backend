import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AvatarModule } from '../storage/avatar.module';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { User } from '../users/entities/user.entity';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDriversService } from './admin-drivers.service';
import { AdminDriverReviewService } from './admin-driver-review.service';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      DriverProfile,
      DriverVehicle,
      DriverDocument,
      DriverOperationalState,
    ]),
    AuthModule,
    AuthorizationModule,
    AvatarModule,
  ],
  controllers: [AdminDriversController],
  providers: [AdminDriversService, AdminDriverReviewService],
  exports: [AdminDriversService, AdminDriverReviewService],
})
export class AdminDriversModule {}
