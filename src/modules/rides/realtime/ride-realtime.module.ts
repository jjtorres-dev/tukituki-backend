import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../auth/auth.module';
import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { Ride } from '../entities/ride.entity';
import { SafetyRealtimeModule } from '../../safety/realtime/safety-realtime.module';
import { RideRealtimeAccessService } from './ride-realtime-access.service';
import { RideRealtimeService } from './ride-realtime.service';
import { RidesGateway } from './rides.gateway';
import { WsJwtAuthGuard } from './ws-jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, DriverProfile]),
    AuthModule,
    SafetyRealtimeModule,
  ],
  providers: [
    RidesGateway,
    RideRealtimeAccessService,
    RideRealtimeService,
    WsJwtAuthGuard,
  ],
  exports: [RideRealtimeService],
})
export class RideRealtimeModule {}
