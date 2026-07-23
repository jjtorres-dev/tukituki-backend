import {
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
import { DriverRidesService } from './driver-rides.service';
import { RideTransitionsService } from './ride-transitions.service';

@ApiTags('Driver rides')
@ApiBearerAuth()
@Controller('drivers/me/rides')
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverRidesController {
  constructor(
    private readonly driverRidesService: DriverRidesService,
    private readonly transitionsService: RideTransitionsService,
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
}
