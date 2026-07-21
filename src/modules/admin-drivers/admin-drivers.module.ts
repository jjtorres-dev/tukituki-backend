import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { User } from '../users/entities/user.entity';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDriversService } from './admin-drivers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      DriverProfile,
      DriverVehicle,
      DriverDocument,
    ]),
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [AdminDriversController],
  providers: [AdminDriversService],
  exports: [AdminDriversService],
})
export class AdminDriversModule {}
