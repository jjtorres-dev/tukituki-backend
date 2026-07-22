import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { DriverLocationResponseDto } from './dto/driver-location-response.dto';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { DriverLocationsService } from './driver-locations.service';

@ApiTags('Driver locations')
@ApiBearerAuth()
@Controller('drivers/me/location')
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverLocationsController {
  constructor(
    private readonly driverLocationsService: DriverLocationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar la última ubicación del conductor',
  })
  @ApiOkResponse({
    type: DriverLocationResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'El conductor todavía no registra una ubicación',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token inexistente o inválido',
  })
  @ApiForbiddenResponse({
    description: 'Se requiere un conductor aprobado',
  })
  getMyLocation(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<DriverLocationResponseDto> {
    return this.driverLocationsService.getMyLocation(user.id);
  }

  @Put()
  @ApiOperation({
    summary: 'Crear o actualizar la ubicación GPS del conductor',
  })
  @ApiOkResponse({
    description: 'Ubicación actualizada correctamente',
    type: DriverLocationResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Coordenadas inválidas o conductor OFFLINE',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token inexistente o inválido',
  })
  @ApiForbiddenResponse({
    description: 'El conductor no está aprobado',
  })
  @ApiServiceUnavailableResponse({
    description: 'La ubicación se guardó, pero Redis no pudo publicarla',
  })
  updateMyLocation(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: UpdateDriverLocationDto,
  ): Promise<DriverLocationResponseDto> {
    return this.driverLocationsService.updateMyLocation(user.id, dto);
  }
}
