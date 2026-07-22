import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZonesModule } from '../service-zones/service-zones.module';
import { AdminFareRulesController } from './admin-fare-rules.controller';
import { FareRule } from './entities/fare-rule.entity';
import { FareRulesService } from './fare-rules.service';
import { FaresController } from './fares.controller';
import { FaresService } from './fares.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FareRule, ServiceZone]),
    AuthModule,
    AuthorizationModule,
    ServiceZonesModule,
  ],
  controllers: [AdminFareRulesController, FaresController],
  providers: [FareRulesService, FaresService],
  exports: [FareRulesService, FaresService],
})
export class FaresModule {}
