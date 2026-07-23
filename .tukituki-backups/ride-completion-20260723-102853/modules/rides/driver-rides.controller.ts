import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { DriverActiveRideResponseDto } from './dto/driver-active-ride-response.dto';
import { RideTransitionResponseDto } from './dto/ride-transition-response.dto';
import { RideStartResponseDto } from './dto/ride-start-response.dto';
import { StartRideDto } from './dto/start-ride.dto';
import { DriverRidesService } from './driver-rides.service';
import { RideStartService } from './ride-start.service';
import { RideTransitionsService } from './ride-transitions.service';

const HTTP_STATUS_LOCKED = 423;

@ApiTags('Driver rides')
@ApiBearerAuth()
@Controller('drivers/me/rides')
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverRidesController {
  constructor(
    private readonly driverRidesService: DriverRidesService,
    private readonly transitionsService: RideTransitionsService,
    private readonly rideStartService: RideStartService,
  ) {}

  @Get('active')
  @ApiOperation({ summary: 'Consultar el viaje activo del conductor' })
  @ApiOkResponse({ type: DriverActiveRideResponseDto })
  @ApiNotFoundResponse({
    description: 'El conductor no tiene un viaje activo',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  getActiveRide(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverActiveRideResponseDto> {
    return this.driverRidesService.getActiveRide(user.id);
  }

  @Get(':rideId')
  @ApiOperation({ summary: 'Consultar un viaje propio del conductor' })
  @ApiOkResponse({ type: DriverActiveRideResponseDto })
  @ApiNotFoundResponse()
  getRide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<DriverActiveRideResponseDto> {
    return this.driverRidesService.getRide(user.id, rideId);
  }

  @Post(':rideId/start-arrival')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Indicar que el conductor se dirige al punto de origen',
  })
  @ApiOkResponse({ type: RideTransitionResponseDto })
  @ApiConflictResponse({
    description: 'Estado del viaje o conductor incompatible',
  })
  @ApiNotFoundResponse()
  startArrival(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<RideTransitionResponseDto> {
    return this.transitionsService.startArrival(user.id, rideId);
  }

  @Post(':rideId/arrive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registrar llegada validada por ubicación PostGIS',
  })
  @ApiOkResponse({ type: RideTransitionResponseDto })
  @ApiBadRequestResponse({
    description: 'GPS ausente, vencido, impreciso o fuera del radio permitido',
  })
  @ApiConflictResponse({
    description: 'Estado del viaje o conductor incompatible',
  })
  @ApiNotFoundResponse()
  arrive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<RideTransitionResponseDto> {
    return this.transitionsService.markArrived(user.id, rideId);
  }

  @Post(':rideId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar el viaje mediante el código entregado por el pasajero',
  })
  @ApiOkResponse({ type: RideStartResponseDto })
  @ApiBadRequestResponse({
    description:
      'Código incorrecto, GPS ausente, vencido, impreciso o conductor lejos del origen',
  })
  @ApiConflictResponse({
    description: 'Estado del viaje, código o conductor incompatible',
  })
  @ApiNotFoundResponse()
  @ApiResponse({
    status: HttpStatus.GONE,
    description: 'El código de inicio venció',
  })
  @ApiResponse({
    status: HTTP_STATUS_LOCKED,
    description: 'El código fue bloqueado por demasiados intentos',
  })
  startRide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: StartRideDto,
  ): Promise<RideStartResponseDto> {
    return this.rideStartService.startRide(user.id, rideId, dto.code);
  }
}
