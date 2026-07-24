import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditLogQueryDto } from './dto/admin-audit-log-query.dto';
import { AdminAuditLogListResponseDto } from './dto/admin-audit-log-response.dto';

@ApiTags('Admin audit')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({ description: 'Access token inválido o vencido' })
@ApiForbiddenResponse({ description: 'Se requiere ADMIN o SUPER_ADMIN' })
export class AdminAuditController {
  constructor(private readonly service: AdminAuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar la bitácora inmutable de acciones administrativas',
  })
  @ApiOkResponse({ type: AdminAuditLogListResponseDto })
  list(
    @Query() query: AdminAuditLogQueryDto,
  ): Promise<AdminAuditLogListResponseDto> {
    return this.service.list(query);
  }
}
