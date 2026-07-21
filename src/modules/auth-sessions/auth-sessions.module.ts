import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthSessionsService } from './auth-sessions.service';
import { AuthSession } from './entities/auth-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuthSession])],
  providers: [AuthSessionsService],
  exports: [AuthSessionsService],
})
export class AuthSessionsModule {}
