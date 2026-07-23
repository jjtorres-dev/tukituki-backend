import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminRidesController } from './admin-rides.controller';
import { AdminRidesService } from './admin-rides.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AdminRidesController],
  providers: [AdminRidesService],
  exports: [AdminRidesService],
})
export class AdminRidesModule {}
