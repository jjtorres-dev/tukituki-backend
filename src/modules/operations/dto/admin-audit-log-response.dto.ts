import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { UserRole } from '../../users/enums/user-role.enum';
import { AdminAuditOutcome } from '../enums/admin-audit-outcome.enum';

export class AdminAuditLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  actorUserId!: string;

  @ApiProperty({ enum: UserRole, isArray: true })
  actorRoles!: UserRole[];

  @ApiProperty()
  action!: string;

  @ApiProperty()
  resourceType!: string;

  @ApiPropertyOptional({ nullable: true })
  resourceId!: string | null;

  @ApiProperty()
  httpMethod!: string;

  @ApiProperty()
  route!: string;

  @ApiProperty({ enum: AdminAuditOutcome })
  outcome!: AdminAuditOutcome;

  @ApiProperty()
  responseStatusCode!: number;

  @ApiProperty()
  requestId!: string;

  @ApiPropertyOptional({ nullable: true })
  ipHash!: string | null;

  @ApiPropertyOptional({ nullable: true })
  userAgent!: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: Date;
}

export class AdminAuditPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class AdminAuditLogListResponseDto {
  @ApiProperty({ type: AdminAuditLogResponseDto, isArray: true })
  items!: AdminAuditLogResponseDto[];

  @ApiProperty({ type: AdminAuditPaginationDto })
  pagination!: AdminAuditPaginationDto;
}
