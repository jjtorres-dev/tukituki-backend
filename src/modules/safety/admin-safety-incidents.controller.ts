import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminSafetyIncidentQueryDto } from './dto/admin-safety-incident-query.dto';
import { ResolveSafetyIncidentDto } from './dto/resolve-safety-incident.dto';
import {
  SafetyIncidentListResponseDto,
  SafetyIncidentResponseDto,
} from './dto/safety-incident-response.dto';
import { RideSafetyService } from './ride-safety.service';

@ApiTags('Admin safety incidents')
@ApiBearerAuth()
@Controller('admin/safety-incidents')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminSafetyIncidentsController {
  constructor(private readonly service: RideSafetyService) {}

  @Get()
  @ApiOperation({ summary: 'Listar incidentes de seguridad' })
  @ApiOkResponse({ type: SafetyIncidentListResponseDto })
  list(
    @Query() query: AdminSafetyIncidentQueryDto,
  ): Promise<SafetyIncidentListResponseDto> {
    return this.service.listAdmin(query);
  }

  @Get(':incidentId')
  @ApiOperation({ summary: 'Consultar un incidente de seguridad' })
  @ApiOkResponse({ type: SafetyIncidentResponseDto })
  @ApiNotFoundResponse()
  getOne(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
  ): Promise<SafetyIncidentResponseDto> {
    return this.service.getAdmin(incidentId);
  }

  @Patch(':incidentId/acknowledge')
  @ApiOperation({ summary: 'Reconocer un incidente abierto' })
  @ApiOkResponse({ type: SafetyIncidentResponseDto })
  @ApiConflictResponse()
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
  ): Promise<SafetyIncidentResponseDto> {
    return this.service.acknowledge(user.id, incidentId);
  }

  @Patch(':incidentId/resolve')
  @ApiOperation({ summary: 'Resolver o marcar como falsa alarma' })
  @ApiOkResponse({ type: SafetyIncidentResponseDto })
  @ApiConflictResponse()
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: ResolveSafetyIncidentDto,
  ): Promise<SafetyIncidentResponseDto> {
    return this.service.resolve(user.id, incidentId, dto);
  }
}
