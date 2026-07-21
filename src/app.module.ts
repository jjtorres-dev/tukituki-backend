import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuthSessionsModule } from './modules/auth-sessions/auth-sessions.module';
import { PassengersModule } from './modules/passengers/passengers.module';
import { DriversModule } from './modules/drivers/drivers.module';

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

    DriversModule,
  ],
})
export class AppModule {}
