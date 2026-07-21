import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthSessionsModule } from '../auth-sessions/auth-sessions.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    UsersModule,
    AuthSessionsModule,
    AuthorizationModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false,
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule],

      inject: [ConfigService],

      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),

        signOptions: {
          expiresIn: configService.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, PasswordService, OtpService, JwtStrategy],

  exports: [AuthService, PasswordService, JwtModule],
})
export class AuthModule {}
