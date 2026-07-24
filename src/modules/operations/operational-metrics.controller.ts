import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import {
  OperationalMetricsQueryDto,
  OperationalTimeSeriesQueryDto,
  RideReportExportQueryDto,
} from './dto/operational-metrics-query.dto';
import {
  OperationalDashboardResponseDto,
  OperationalTimeSeriesResponseDto,
  OperationalZonesResponseDto,
} from './dto/operational-metrics-response.dto';
import { OperationalMetricsService } from './operational-metrics.service';

@ApiTags('Admin operational reports')
@ApiBearerAuth()
@Controller('admin/operations')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({ description: 'Access token inválido o vencido' })
@ApiForbiddenResponse({ description: 'Se requiere ADMIN o SUPER_ADMIN' })
export class OperationalMetricsController {
  constructor(private readonly service: OperationalMetricsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Consultar indicadores operativos consolidados',
  })
  @ApiOkResponse({ type: OperationalDashboardResponseDto })
  dashboard(
    @Query() query: OperationalMetricsQueryDto,
  ): Promise<OperationalDashboardResponseDto> {
    return this.service.dashboard(query);
  }

  @Get('time-series')
  @ApiOperation({
    summary: 'Consultar la evolución de viajes y facturación por intervalo',
  })
  @ApiOkResponse({ type: OperationalTimeSeriesResponseDto })
  timeSeries(
    @Query() query: OperationalTimeSeriesQueryDto,
  ): Promise<OperationalTimeSeriesResponseDto> {
    return this.service.timeSeries(query);
  }

  @Get('zones')
  @ApiOperation({
    summary: 'Comparar desempeño operativo por zona de origen',
  })
  @ApiOkResponse({ type: OperationalZonesResponseDto })
  zones(
    @Query() query: OperationalMetricsQueryDto,
  ): Promise<OperationalZonesResponseDto> {
    return this.service.zones(query);
  }

  @Get('reports/rides.csv')
  @ApiOperation({
    summary: 'Exportar el reporte operativo de viajes en formato CSV',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'Archivo CSV UTF-8 compatible con hojas de cálculo',
  })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportRides(
    @Query() query: RideReportExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="tukituki-rides-report.csv"',
    );
    return this.service.exportRidesCsv(query);
  }
}
