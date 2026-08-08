import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { createDatabaseSslOptions } from './config/database-ssl.config';
import { envValidationSchema } from './config/env.validation';
import { createThrottlerOptions } from './config/throttling.config';
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
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OperationsModule } from './modules/operations/operations.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { PassengersModule } from './modules/passengers/passengers.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlacesModule } from './modules/places/places.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { RidesModule } from './modules/rides/rides.module';
import { SafetyModule } from './modules/safety/safety.module';
import { ServiceZonesModule } from './modules/service-zones/service-zones.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],

      useFactory: createThrottlerOptions,
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

        ssl: createDatabaseSslOptions(
          configService.getOrThrow<boolean>('DATABASE_SSL'),

          configService.getOrThrow<boolean>('DATABASE_SSL_REJECT_UNAUTHORIZED'),

          configService.get<string>('DATABASE_SSL_CA_BASE64'),
        ),

        autoLoadEntities: true,

        /*
         * Nunca dependeremos de
         * synchronize en TukiTuki.
         *
         * Los cambios de base de datos
         * se realizan mediante migraciones.
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
    PromotionsModule,
    DriversModule,
    AdminDriversModule,
    AdminRidesModule,
    DriverOperationsModule,
    ServiceZonesModule,
    PlacesModule,
    FaresModule,
    SettlementsModule,
    RidesModule,
    SafetyModule,
  ],

  providers: [
    {
      provide: APP_GUARD,

      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
