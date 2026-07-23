import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminRideLocationQueryDto } from './dto/admin-ride-location-query.dto';
import { AdminRideQueryDto } from './dto/admin-ride-query.dto';
import {
  AdminRideDetailResponseDto,
  AdminRideListResponseDto,
  AdminRideLocationListResponseDto,
  AdminRideTimelineResponseDto,
} from './dto/admin-ride-response.dto';
import { AdminRidesService } from './admin-rides.service';

@ApiTags('Admin rides')
@ApiBearerAuth()
@Controller('admin/rides')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({ description: 'Access token inválido o vencido' })
@ApiForbiddenResponse({ description: 'Se requiere ADMIN o SUPER_ADMIN' })
export class AdminRidesController {
  constructor(private readonly service: AdminRidesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar y filtrar todos los viajes para el panel administrativo',
  })
  @ApiOkResponse({ type: AdminRideListResponseDto })
  list(@Query() query: AdminRideQueryDto): Promise<AdminRideListResponseDto> {
    return this.service.list(query);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Listar únicamente los viajes actualmente activos',
  })
  @ApiOkResponse({ type: AdminRideListResponseDto })
  listActive(
    @Query() query: AdminRideQueryDto,
  ): Promise<AdminRideListResponseDto> {
    return this.service.list(query, true);
  }

  @Get(':rideId')
  @ApiOperation({
    summary: 'Consultar el detalle operativo consolidado de un viaje',
  })
  @ApiOkResponse({ type: AdminRideDetailResponseDto })
  @ApiNotFoundResponse({ description: 'El viaje no existe' })
  getDetail(
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<AdminRideDetailResponseDto> {
    return this.service.getDetail(rideId);
  }

  @Get(':rideId/timeline')
  @ApiOperation({
    summary: 'Consultar la cronología de estados de un viaje',
  })
  @ApiOkResponse({ type: AdminRideTimelineResponseDto })
  @ApiNotFoundResponse({ description: 'El viaje no existe' })
  getTimeline(
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<AdminRideTimelineResponseDto> {
    return this.service.getTimeline(rideId);
  }

  @Get(':rideId/locations')
  @ApiOperation({
    summary: 'Consultar las muestras GPS paginadas de un viaje',
  })
  @ApiOkResponse({ type: AdminRideLocationListResponseDto })
  @ApiNotFoundResponse({ description: 'El viaje no existe' })
  getLocations(
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Query() query: AdminRideLocationQueryDto,
  ): Promise<AdminRideLocationListResponseDto> {
    return this.service.getLocations(rideId, query);
  }
}
