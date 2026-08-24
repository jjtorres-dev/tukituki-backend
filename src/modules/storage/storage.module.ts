import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageInfrastructureModule } from '../../infrastructure/storage/storage-infrastructure.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriversModule } from '../drivers/drivers.module';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { PassengersModule } from '../passengers/passengers.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DriverProfile, PassengerProfile, DriverDocument]),
    StorageInfrastructureModule,
    AuthModule,
    AuthorizationModule,
    DriversModule,
    PassengersModule,
  ],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
