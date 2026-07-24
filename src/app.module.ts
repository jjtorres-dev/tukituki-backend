import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { envValidationSchema } from './config/env.validation';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AdminDriversModule } from './modules/admin-drivers/admin-drivers.module';
import { AdminRidesModule } from './modules/admin-rides/admin-rides.module';
import { AuthSessionsModule } from './modules/auth-sessions/auth-sessions.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { DriverOperationsModule } from './modules/driver-operations/driver-operations.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { FaresModule } from './modules/fares/fares.module';
import { HealthModule } from './modules/health/health.module';
import { PassengersModule } from './modules/passengers/passengers.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { OperationsModule } from './modules/operations/operations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RidesModule } from './modules/rides/rides.module';
import { ServiceZonesModule } from './modules/service-zones/service-zones.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { SafetyModule } from './modules/safety/safety.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,

        host: configService.getOrThrow<string>('DATABASE_HOST'),
        port: configService.getOrThrow<number>('DATABASE_PORT'),

        database: configService.getOrThrow<string>('DATABASE_NAME'),
        username: configService.getOrThrow<string>('DATABASE_USER'),
        password: configService.getOrThrow<string>('DATABASE_PASSWORD'),

        ssl: configService.getOrThrow<boolean>('DATABASE_SSL'),

        autoLoadEntities: true,

        /*
         * Nunca dependeremos de synchronize en TukiTuki.
         * Los cambios de base de datos se harán mediante migraciones.
         */
        synchronize: false,

        retryAttempts: 10,
        retryDelay: 3000,
      }),
    }),

    HealthModule,
    UsersModule,
    AuthModule,
    RedisModule,
    AuthSessionsModule,
    PassengersModule,
    NotificationsModule,
    OutboxModule,
    OperationsModule,
    CommissionsModule,
    PaymentsModule,
    DriversModule,
    AdminDriversModule,
    AdminRidesModule,
    DriverOperationsModule,
    ServiceZonesModule,
    FaresModule,
    SettlementsModule,
    RidesModule,
    SafetyModule,
  ],
})
export class AppModule {}
