import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RideCommission } from '../commissions/entities/ride-commission.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { OutboxModule } from '../outbox/outbox.module';
import { AdminDriverSettlementsController } from './admin-driver-settlements.controller';
import { DriverSettlementsController } from './driver-settlements.controller';
import { DriverSettlementsService } from './driver-settlements.service';
import { DriverSettlementItem } from './entities/driver-settlement-item.entity';
import { DriverSettlement } from './entities/driver-settlement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverSettlement,
      DriverSettlementItem,
      RideCommission,
      DriverProfile,
    ]),
    AuthModule,
    AuthorizationModule,
    OutboxModule,
  ],
  controllers: [AdminDriverSettlementsController, DriverSettlementsController],
  providers: [DriverSettlementsService],
  exports: [DriverSettlementsService],
})
export class SettlementsModule {}
