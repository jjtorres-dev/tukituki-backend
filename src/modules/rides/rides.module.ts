import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { FareQuote } from '../fares/entities/fare-quote.entity';
import { FareRule } from '../fares/entities/fare-rule.entity';
import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { User } from '../users/entities/user.entity';
import { Ride } from './entities/ride.entity';
import { PassengerRidesController } from './passenger-rides.controller';
import { PassengerRidesService } from './passenger-rides.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ride,
      FareQuote,
      FareRule,
      ServiceZone,
      User,
      DriverProfile,
    ]),
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [PassengerRidesController],
  providers: [PassengerRidesService],
  exports: [PassengerRidesService],
})
export class RidesModule {}
