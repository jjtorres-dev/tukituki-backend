import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { CompleteRideDto } from './dto/complete-ride.dto';
import { DriverCancelRideDto } from './dto/driver-cancel-ride.dto';
import { ConfirmPassengerNoShowDto } from './dto/confirm-passenger-no-show.dto';
import { RideCancellationResponseDto } from './dto/ride-cancellation-response.dto';
import { RideWaitingResponseDto } from './dto/ride-waiting-response.dto';
import { DriverRideHistoryResponseDto } from './dto/driver-ride-history-response.dto';
import { RideHistoryQueryDto } from './dto/ride-history-query.dto';
import { RideRatingResponseDto } from './dto/ride-rating-response.dto';
import { SubmitRideRatingDto } from './dto/submit-ride-rating.dto';
import { DriverActiveRideResponseDto } from './dto/driver-active-ride-response.dto';
import { RideCompletionResponseDto } from './dto/ride-completion-response.dto';
import { RideReceiptResponseDto } from './dto/ride-receipt-response.dto';
import { RideTransitionResponseDto } from './dto/ride-transition-response.dto';
import { RideStartResponseDto } from './dto/ride-start-response.dto';
import { StartRideDto } from './dto/start-ride.dto';
import { DriverRidesService } from './driver-rides.service';
import { RideCompletionService } from './ride-completion.service';
import { RideReceiptsService } from './ride-receipts.service';
import { RideHistoryService } from './ride-history.service';
import { RideRatingsService } from './ride-ratings.service';
import { RideCancellationsService } from './ride-cancellations.service';
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
    private readonly rideCompletionService: RideCompletionService,
    private readonly rideReceiptsService: RideReceiptsService,
    private readonly rideHistoryService: RideHistoryService,
    private readonly rideRatingsService: RideRatingsService,
    private readonly rideCancellationsService: RideCancellationsService,
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

  @Get('history')
  @ApiOperation({ summary: 'Consultar el historial paginado del conductor' })
  @ApiOkResponse({ type: DriverRideHistoryResponseDto })
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RideHistoryQueryDto,
  ): Promise<DriverRideHistoryResponseDto> {
    return this.rideHistoryService.getDriverHistory(user.id, query);
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

  @Post(':rideId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar un viaje asignado como conductor' })
  @ApiOkResponse({ type: RideCancellationResponseDto })
  @ApiBadRequestResponse({ description: 'El estado no permite cancelación' })
  @ApiConflictResponse({ description: 'El viaje ya fue cancelado' })
  @ApiNotFoundResponse()
  cancelRide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: DriverCancelRideDto,
  ): Promise<RideCancellationResponseDto> {
    return this.rideCancellationsService.cancelByDriver(user.id, rideId, dto);
  }

  @Post(':rideId/waiting/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar el tiempo de espera en el origen' })
  @ApiOkResponse({ type: RideWaitingResponseDto })
  @ApiBadRequestResponse({ description: 'GPS inválido o lejos del origen' })
  @ApiConflictResponse({ description: 'El viaje no está en DRIVER_ARRIVED' })
  startWaiting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<RideWaitingResponseDto> {
    return this.rideCancellationsService.startWaiting(user.id, rideId);
  }

  @Get(':rideId/waiting')
  @ApiOperation({
    summary: 'Consultar el tiempo de espera y disponibilidad de no-show',
  })
  @ApiOkResponse({ type: RideWaitingResponseDto })
  @ApiNotFoundResponse()
  getWaiting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<RideWaitingResponseDto> {
    return this.rideCancellationsService.getWaiting(user.id, rideId);
  }

  @Post(':rideId/no-show/passenger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar no-show del pasajero después de la espera',
  })
  @ApiOkResponse({ type: RideCancellationResponseDto })
  @ApiBadRequestResponse({ description: 'GPS inválido o lejos del origen' })
  @ApiConflictResponse({ description: 'Tiempo de espera aún no cumplido' })
  confirmPassengerNoShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: ConfirmPassengerNoShowDto,
  ): Promise<RideCancellationResponseDto> {
    return this.rideCancellationsService.confirmPassengerNoShow(
      user.id,
      rideId,
      dto.reasonDetail,
    );
  }

  @Post(':rideId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finalizar el viaje cerca del destino y calcular la tarifa final',
  })
  @ApiOkResponse({ type: RideCompletionResponseDto })
  @ApiBadRequestResponse({
    description:
      'GPS ausente, vencido, impreciso o conductor lejos del destino',
  })
  @ApiConflictResponse({
    description: 'El viaje o el conductor no están en un estado compatible',
  })
  @ApiNotFoundResponse()
  completeRide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: CompleteRideDto,
  ): Promise<RideCompletionResponseDto> {
    return this.rideCompletionService.completeRide(user.id, rideId, dto);
  }

  @Post(':rideId/rating')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Calificar al pasajero de un viaje completado' })
  @ApiCreatedResponse({ type: RideRatingResponseDto })
  @ApiBadRequestResponse({ description: 'Puntuación o etiquetas inválidas' })
  @ApiConflictResponse({
    description: 'El viaje no está completado o ya fue calificado',
  })
  @ApiNotFoundResponse({
    description: 'El viaje no existe o no pertenece al conductor',
  })
  ratePassenger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: SubmitRideRatingDto,
  ): Promise<RideRatingResponseDto> {
    return this.rideRatingsService.ratePassenger(user.id, rideId, dto);
  }

  @Get(':rideId/receipt')
  @ApiOperation({ summary: 'Consultar el comprobante de un viaje finalizado' })
  @ApiOkResponse({ type: RideReceiptResponseDto })
  @ApiNotFoundResponse()
  getReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<RideReceiptResponseDto> {
    return this.rideReceiptsService.getDriverReceipt(user.id, rideId);
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
