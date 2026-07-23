import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { CancelPassengerRideDto } from './dto/cancel-passenger-ride.dto';
import { CreatePassengerRideDto } from './dto/create-passenger-ride.dto';
import { PassengerRideResponseDto } from './dto/passenger-ride-response.dto';
import { PassengerRideStartCodeResponseDto } from './dto/passenger-ride-start-code-response.dto';
import { PassengerRidesService } from './passenger-rides.service';
import { RideStartCodesService } from './ride-start-codes.service';

const HTTP_STATUS_LOCKED = 423;

@ApiTags('Passenger rides')
@ApiBearerAuth()
@Controller('passenger/rides')
@Roles(UserRole.PASSENGER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class PassengerRidesController {
  constructor(
    private readonly passengerRidesService: PassengerRidesService,
    private readonly rideStartCodesService: RideStartCodesService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una solicitud de viaje desde una cotización vigente',
  })
  @ApiCreatedResponse({
    type: PassengerRideResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Cotización vencida, utilizada o referencias desactivadas',
  })
  @ApiConflictResponse({
    description: 'El pasajero ya tiene un viaje activo',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  createRide(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: CreatePassengerRideDto,
  ): Promise<PassengerRideResponseDto> {
    return this.passengerRidesService.createRide(user.id, dto);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Consultar el viaje activo del pasajero',
  })
  @ApiOkResponse({
    type: PassengerRideResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'El pasajero no tiene un viaje activo',
  })
  getActiveRide(
    @CurrentUser()
    user: AuthenticatedUser,
  ): Promise<PassengerRideResponseDto> {
    return this.passengerRidesService.getActiveRide(user.id);
  }

  @Get(':rideId/start-code')
  @ApiOperation({
    summary: 'Consultar el código seguro para iniciar el viaje',
  })
  @ApiOkResponse({ type: PassengerRideStartCodeResponseDto })
  @ApiConflictResponse({
    description: 'El conductor todavía no llegó o el código no está disponible',
  })
  @ApiNotFoundResponse({
    description: 'El viaje no existe o no pertenece al pasajero',
  })
  @ApiResponse({
    status: HttpStatus.GONE,
    description: 'El código venció y debe regenerarse',
  })
  @ApiResponse({
    status: HTTP_STATUS_LOCKED,
    description: 'El código está bloqueado por intentos fallidos',
  })
  getStartCode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<PassengerRideStartCodeResponseDto> {
    return this.rideStartCodesService.getPassengerStartCode(user.id, rideId);
  }

  @Post(':rideId/start-code/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerar e invalidar el código anterior de inicio',
  })
  @ApiOkResponse({ type: PassengerRideStartCodeResponseDto })
  @ApiConflictResponse({
    description: 'El viaje o el código ya no permiten regeneración',
  })
  @ApiNotFoundResponse({
    description: 'El viaje no existe o no pertenece al pasajero',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Se alcanzó el límite de regeneraciones',
  })
  regenerateStartCode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<PassengerRideStartCodeResponseDto> {
    return this.rideStartCodesService.regeneratePassengerStartCode(
      user.id,
      rideId,
    );
  }

  @Get(':rideId')
  @ApiOperation({
    summary: 'Consultar un viaje propio por identificador',
  })
  @ApiOkResponse({
    type: PassengerRideResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'El viaje no existe o no pertenece al pasajero',
  })
  getRide(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('rideId', ParseUUIDPipe)
    rideId: string,
  ): Promise<PassengerRideResponseDto> {
    return this.passengerRidesService.getRide(user.id, rideId);
  }

  @Patch(':rideId/cancel')
  @ApiOperation({
    summary: 'Cancelar un viaje antes de iniciar el recorrido',
  })
  @ApiOkResponse({
    type: PassengerRideResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El viaje ya no puede cancelarse en su estado actual',
  })
  @ApiNotFoundResponse({
    description: 'El viaje no existe o no pertenece al pasajero',
  })
  cancelRide(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('rideId', ParseUUIDPipe)
    rideId: string,

    @Body()
    dto: CancelPassengerRideDto,
  ): Promise<PassengerRideResponseDto> {
    return this.passengerRidesService.cancelRide(user.id, rideId, dto);
  }
}
