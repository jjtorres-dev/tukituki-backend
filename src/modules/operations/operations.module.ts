import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { OperationalMetricsController } from './operational-metrics.controller';
import { OperationalMetricsService } from './operational-metrics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminAuditLog]),
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [AdminAuditController, OperationalMetricsController],
  providers: [
    AdminAuditService,
    OperationalMetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminAuditInterceptor,
    },
  ],
  exports: [AdminAuditService, OperationalMetricsService],
})
export class OperationsModule {}
