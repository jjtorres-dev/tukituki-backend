import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { OutboxModule } from '../outbox/outbox.module';
import { RidePayment } from '../payments/entities/ride-payment.entity';
import { Ride } from '../rides/entities/ride.entity';
import { AdminCommissionsController } from './admin-commissions.controller';
import { CommissionPolicyService } from './commission-policy.service';
import { CommissionsService } from './commissions.service';
import { DriverCommissionsController } from './driver-commissions.controller';
import { CommissionPolicy } from './entities/commission-policy.entity';
import { RideCommission } from './entities/ride-commission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommissionPolicy,
      RideCommission,
      Ride,
      RidePayment,
      DriverProfile,
    ]),
    AuthModule,
    AuthorizationModule,
    OutboxModule,
  ],
  controllers: [DriverCommissionsController, AdminCommissionsController],
  providers: [CommissionPolicyService, CommissionsService],
  exports: [CommissionPolicyService, CommissionsService],
})
export class CommissionsModule {}
