import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { CreateServiceZoneDto } from './dto/create-service-zone.dto';
import {
  ServiceZoneListResponseDto,
  ServiceZoneResponseDto,
} from './dto/service-zone-response.dto';
import { ServiceZoneQueryDto } from './dto/service-zone-query.dto';
import { UpdateServiceZoneDto } from './dto/update-service-zone.dto';
import { ServiceZonesService } from './service-zones.service';

@ApiTags('Admin service zones')
@ApiBearerAuth()
@Controller('admin/service-zones')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminServiceZonesController {
  constructor(private readonly serviceZonesService: ServiceZonesService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una zona de cobertura inactiva',
  })
  @ApiOkResponse({
    type: ServiceZoneResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El polígono o los datos son inválidos',
  })
  @ApiConflictResponse({
    description: 'El código de la zona ya existe',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  create(
    @Body()
    dto: CreateServiceZoneDto,
  ): Promise<ServiceZoneResponseDto> {
    return this.serviceZonesService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar zonas de cobertura',
  })
  @ApiOkResponse({
    type: ServiceZoneListResponseDto,
  })
  list(
    @Query()
    query: ServiceZoneQueryDto,
  ): Promise<ServiceZoneListResponseDto> {
    return this.serviceZonesService.list(query);
  }

  @Get(':zoneId')
  @ApiOperation({
    summary: 'Consultar una zona de cobertura',
  })
  @ApiOkResponse({
    type: ServiceZoneResponseDto,
  })
  @ApiNotFoundResponse()
  getById(
    @Param(
      'zoneId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    zoneId: string,
  ): Promise<ServiceZoneResponseDto> {
    return this.serviceZonesService.getById(zoneId);
  }

  @Patch(':zoneId')
  @ApiOperation({
    summary: 'Actualizar una zona de cobertura',
  })
  @ApiOkResponse({
    type: ServiceZoneResponseDto,
  })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  @ApiNotFoundResponse()
  update(
    @Param(
      'zoneId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    zoneId: string,

    @Body()
    dto: UpdateServiceZoneDto,
  ): Promise<ServiceZoneResponseDto> {
    return this.serviceZonesService.update(zoneId, dto);
  }

  @Patch(':zoneId/activate')
  @ApiOperation({
    summary: 'Activar una zona de cobertura',
  })
  @ApiOkResponse({
    type: ServiceZoneResponseDto,
  })
  activate(
    @Param(
      'zoneId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    zoneId: string,
  ): Promise<ServiceZoneResponseDto> {
    return this.serviceZonesService.activate(zoneId);
  }

  @Patch(':zoneId/deactivate')
  @ApiOperation({
    summary: 'Desactivar una zona de cobertura',
  })
  @ApiOkResponse({
    type: ServiceZoneResponseDto,
  })
  deactivate(
    @Param(
      'zoneId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    zoneId: string,
  ): Promise<ServiceZoneResponseDto> {
    return this.serviceZonesService.deactivate(zoneId);
  }
}
