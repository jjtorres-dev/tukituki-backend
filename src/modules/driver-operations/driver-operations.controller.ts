import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { DriverOperationalStateResponseDto } from './dto/driver-operational-state-response.dto';
import { DriverOperationsService } from './driver-operations.service';

@ApiTags('Driver operations')
@ApiBearerAuth()
@Controller('drivers/me/operational-status')
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverOperationsController {
  constructor(
    private readonly driverOperationsService: DriverOperationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar el estado operativo del conductor',
  })
  @ApiOkResponse({
    type: DriverOperationalStateResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token inexistente o inválido',
  })
  @ApiForbiddenResponse({
    description: 'Se requiere un conductor aprobado',
  })
  @ApiNotFoundResponse({
    description: 'El perfil del conductor no existe',
  })
  getMyStatus(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<DriverOperationalStateResponseDto> {
    return this.driverOperationsService.getMyStatus(user.id);
  }

  @Patch('online')
  @ApiOperation({
    summary: 'Conectar al conductor y dejarlo disponible',
  })
  @ApiOkResponse({
    description: 'Conductor disponible para recibir viajes',
    type: DriverOperationalStateResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Vehículo o documentos inválidos, vencidos o no aprobados',
  })
  @ApiForbiddenResponse({
    description: 'El conductor no está aprobado',
  })
  goOnline(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<DriverOperationalStateResponseDto> {
    return this.driverOperationsService.goOnline(user.id);
  }

  @Patch('offline')
  @ApiOperation({
    summary: 'Desconectar al conductor',
  })
  @ApiOkResponse({
    description: 'Conductor desconectado',
    type: DriverOperationalStateResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El conductor tiene un viaje activo',
  })
  goOffline(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<DriverOperationalStateResponseDto> {
    return this.driverOperationsService.goOffline(user.id);
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registrar actividad de la aplicación del conductor',
  })
  @ApiOkResponse({
    description: 'Heartbeat registrado',
    type: DriverOperationalStateResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El conductor se encuentra desconectado',
  })
  heartbeat(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<DriverOperationalStateResponseDto> {
    return this.driverOperationsService.heartbeat(user.id);
  }
}
