import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AvatarModule } from '../storage/avatar.module';
import { AdminRidesController } from './admin-rides.controller';
import { AdminRidesService } from './admin-rides.service';

@Module({
  imports: [AuthModule, AuthorizationModule, AvatarModule],
  controllers: [AdminRidesController],
  providers: [AdminRidesService],
  exports: [AdminRidesService],
})
export class AdminRidesModule {}
