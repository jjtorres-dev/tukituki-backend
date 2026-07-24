import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserRole } from '../users/enums/user-role.enum';
import { AdminAuditLogQueryDto } from './dto/admin-audit-log-query.dto';
import { AdminAuditLogListResponseDto } from './dto/admin-audit-log-response.dto';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AdminAuditOutcome } from './enums/admin-audit-outcome.enum';

export interface CreateAdminAuditLogInput {
  actorUserId: string;
  actorRoles: UserRole[];
  action: string;
  resourceType: string;
  resourceId: string | null;
  httpMethod: string;
  route: string;
  outcome: AdminAuditOutcome;
  responseStatusCode: number;
  requestId: string;
  ipHash: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly repository: Repository<AdminAuditLog>,
  ) {}

  async record(input: CreateAdminAuditLogInput): Promise<void> {
    try {
      await this.repository.save(Object.assign(new AdminAuditLog(), input));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No fue posible persistir la auditoría ${input.requestId}: ${message}`,
      );
    }
  }

  async list(
    query: AdminAuditLogQueryDto,
  ): Promise<AdminAuditLogListResponseDto> {
    const builder = this.repository.createQueryBuilder('audit');

    if (query.actorUserId) {
      builder.andWhere('audit.actorUserId = :actorUserId', {
        actorUserId: query.actorUserId,
      });
    }
    if (query.action) {
      builder.andWhere('audit.action ILIKE :action', {
        action: `%${query.action}%`,
      });
    }
    if (query.resourceType) {
      builder.andWhere('audit.resourceType = :resourceType', {
        resourceType: query.resourceType,
      });
    }
    if (query.resourceId) {
      builder.andWhere('audit.resourceId = :resourceId', {
        resourceId: query.resourceId,
      });
    }
    if (query.outcome) {
      builder.andWhere('audit.outcome = :outcome', {
        outcome: query.outcome,
      });
    }
    if (query.dateFrom) {
      builder.andWhere('audit.occurredAt >= :dateFrom', {
        dateFrom: new Date(query.dateFrom),
      });
    }
    if (query.dateTo) {
      builder.andWhere('audit.occurredAt < :dateTo', {
        dateTo: new Date(query.dateTo),
      });
    }

    const [items, total] = await builder
      .orderBy('audit.occurredAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
