import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateDriverVehicleDto } from './dto/create-driver-vehicle.dto';
import { DriverVehicleResponseDto } from './dto/driver-vehicle-response.dto';
import { UpdateDriverVehicleDto } from './dto/update-driver-vehicle.dto';
import { DriverVehiclesService } from './driver-vehicles.service';

@ApiTags('Driver vehicles')
@ApiBearerAuth()
@Controller('drivers/me/vehicle')
@Roles(UserRole.PASSENGER, UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverVehiclesController {
  constructor(private readonly driverVehiclesService: DriverVehiclesService) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar el vehículo del conductor autenticado',
  })
  @ApiCreatedResponse({
    description: 'Vehículo registrado como borrador',
    type: DriverVehicleResponseDto,
  })
  @ApiConflictResponse({
    description: 'El vehículo o uno de sus identificadores ya está registrado',
  })
  @ApiBadRequestResponse({
    description: 'La solicitud no permite registrar o modificar vehículos',
  })
  @ApiNotFoundResponse({
    description: 'El perfil de conductor todavía no existe',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token inexistente o inválido',
  })
  @ApiForbiddenResponse({
    description: 'La cuenta no posee un rol permitido',
  })
  createMyVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDriverVehicleDto,
  ): Promise<DriverVehicleResponseDto> {
    return this.driverVehiclesService.createMyVehicle(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Consultar el vehículo del conductor autenticado',
  })
  @ApiOkResponse({
    type: DriverVehicleResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'El perfil o el vehículo todavía no existe',
  })
  getMyVehicle(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverVehicleResponseDto> {
    return this.driverVehiclesService.getMyVehicle(user.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Actualizar el vehículo del conductor autenticado',
  })
  @ApiOkResponse({
    description: 'Vehículo actualizado correctamente',
    type: DriverVehicleResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El vehículo no puede modificarse en su estado actual',
  })
  @ApiConflictResponse({
    description: 'La placa, motor o chasis ya está registrado',
  })
  @ApiNotFoundResponse({
    description: 'El perfil o el vehículo todavía no existe',
  })
  updateMyVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDriverVehicleDto,
  ): Promise<DriverVehicleResponseDto> {
    return this.driverVehiclesService.updateMyVehicle(user.id, dto);
  }
}
