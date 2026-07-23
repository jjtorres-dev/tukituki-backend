import {
  Body,
  Controller,
  Get,
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
import { PassengerRidesService } from './passenger-rides.service';

@ApiTags('Passenger rides')
@ApiBearerAuth()
@Controller('passenger/rides')
@Roles(UserRole.PASSENGER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class PassengerRidesController {
  constructor(private readonly passengerRidesService: PassengerRidesService) {}

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
    summary: 'Cancelar una solicitud mientras busca conductor',
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
