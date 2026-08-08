import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [AuthModule, AuthorizationModule],

  controllers: [PlacesController],

  providers: [PlacesService],

  exports: [PlacesService],
})
export class PlacesModule {}
