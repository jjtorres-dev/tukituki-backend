import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZonesModule } from '../service-zones/service-zones.module';
import { User } from '../users/entities/user.entity';
import { AdminFareRulesController } from './admin-fare-rules.controller';
import { FareQuote } from './entities/fare-quote.entity';
import { FareRule } from './entities/fare-rule.entity';
import { FareRulesService } from './fare-rules.service';
import { FaresController } from './fares.controller';
import { FaresService } from './fares.service';
import { GoogleRoutesService } from './google-routes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FareRule, FareQuote, ServiceZone, User]),
    AuthModule,
    AuthorizationModule,
    ServiceZonesModule,
  ],

  controllers: [AdminFareRulesController, FaresController],

  providers: [FareRulesService, GoogleRoutesService, FaresService],

  exports: [FareRulesService, FaresService],
})
export class FaresModule {}
