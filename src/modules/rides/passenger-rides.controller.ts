import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
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
import { PassengerCancelRideDto } from './dto/passenger-cancel-ride.dto';
import { PassengerCancellationPreviewDto } from './dto/passenger-cancellation-preview.dto';
import { ReportDriverNoShowDto } from './dto/report-driver-no-show.dto';
import { DriverNoShowResponseDto } from './dto/driver-no-show-response.dto';
import {
  PassengerCancellationPreviewResponseDto,
  RideCancellationResponseDto,
} from './dto/ride-cancellation-response.dto';
import { CreatePassengerRideDto } from './dto/create-passenger-ride.dto';
import { PassengerRideHistoryResponseDto } from './dto/passenger-ride-history-response.dto';
import { RideHistoryQueryDto } from './dto/ride-history-query.dto';
import { RideRatingResponseDto } from './dto/ride-rating-response.dto';
import { SubmitRideRatingDto } from './dto/submit-ride-rating.dto';
import { PassengerRideResponseDto } from './dto/passenger-ride-response.dto';
import { RideReceiptResponseDto } from './dto/ride-receipt-response.dto';
import { PassengerRideStartCodeResponseDto } from './dto/passenger-ride-start-code-response.dto';
import { PassengerRidesService } from './passenger-rides.service';
import { RideReceiptsService } from './ride-receipts.service';
import { RideHistoryService } from './ride-history.service';
import { RideRatingsService } from './ride-ratings.service';
import { RideCancellationsService } from './ride-cancellations.service';
import { PassengerCancellationReason } from './enums/passenger-cancellation-reason.enum';
import { RideStartCodesService } from './ride-start-codes.service';
import { PassengerRideOfferResponseDto } from './dto/passenger-ride-offer-response.dto';

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
    private readonly rideReceiptsService: RideReceiptsService,
    private readonly rideHistoryService: RideHistoryService,
    private readonly rideRatingsService: RideRatingsService,
    private readonly rideCancellationsService: RideCancellationsService,
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

  @Get(':rideId/offers')
  @ApiOperation({
    summary: 'Listar propuestas de conductores para un viaje en búsqueda',
  })
  @ApiOkResponse({
    type: PassengerRideOfferResponseDto,
    isArray: true,
  })
  @ApiConflictResponse({
    description: 'El viaje ya no se encuentra recibiendo propuestas',
  })
  @ApiNotFoundResponse({
    description: 'El viaje no existe o no pertenece al pasajero',
  })
  getRideOffers(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('rideId', ParseUUIDPipe)
    rideId: string,
  ): Promise<PassengerRideOfferResponseDto[]> {
    return this.passengerRidesService.getRideOffers(user.id, rideId);
  }

  @Post(':rideId/offers/:offerId/select')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Elegir una propuesta y asignar al conductor',
  })
  @ApiOkResponse({
    type: PassengerRideResponseDto,
  })
  @ApiConflictResponse({
    description:
      'La propuesta venció, el conductor dejó de estar disponible o el viaje ya fue asignado',
  })
  @ApiNotFoundResponse({
    description: 'El viaje o la propuesta no existen',
  })
  selectRideOffer(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('rideId', ParseUUIDPipe)
    rideId: string,

    @Param('offerId', ParseUUIDPipe)
    offerId: string,
  ): Promise<PassengerRideResponseDto> {
    return this.passengerRidesService.selectRideOffer(user.id, rideId, offerId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Consultar el historial paginado del pasajero' })
  @ApiOkResponse({ type: PassengerRideHistoryResponseDto })
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RideHistoryQueryDto,
  ): Promise<PassengerRideHistoryResponseDto> {
    return this.rideHistoryService.getPassengerHistory(user.id, query);
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

  @Post(':rideId/rating')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Calificar al conductor de un viaje completado' })
  @ApiCreatedResponse({ type: RideRatingResponseDto })
  @ApiBadRequestResponse({ description: 'Puntuación o etiquetas inválidas' })
  @ApiConflictResponse({
    description: 'El viaje no está completado o ya fue calificado',
  })
  @ApiNotFoundResponse({
    description: 'El viaje no existe o no pertenece al pasajero',
  })
  rateDriver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: SubmitRideRatingDto,
  ): Promise<RideRatingResponseDto> {
    return this.rideRatingsService.rateDriver(user.id, rideId, dto);
  }

  @Post(':rideId/cancellation-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calcular la tarifa antes de cancelar un viaje' })
  @ApiOkResponse({ type: PassengerCancellationPreviewResponseDto })
  @ApiBadRequestResponse({
    description: 'El viaje ya no admite cancelación estándar',
  })
  @ApiNotFoundResponse()
  previewCancellation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: PassengerCancellationPreviewDto,
  ): Promise<PassengerCancellationPreviewResponseDto> {
    return this.rideCancellationsService.previewPassengerCancellation(
      user.id,
      rideId,
      dto,
    );
  }

  @Post(':rideId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar una cancelación con tarifa validada' })
  @ApiOkResponse({ type: RideCancellationResponseDto })
  @ApiConflictResponse({
    description: 'La tarifa cambió o el viaje ya fue cancelado',
  })
  @ApiBadRequestResponse({ description: 'El estado no permite cancelación' })
  @ApiNotFoundResponse()
  cancelRideAdvanced(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: PassengerCancelRideDto,
  ): Promise<RideCancellationResponseDto> {
    return this.rideCancellationsService.cancelByPassenger(
      user.id,
      rideId,
      dto,
    );
  }

  @Post(':rideId/no-show/driver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reportar conductor sin progreso y reiniciar matching o cancelar',
  })
  @ApiOkResponse({ type: DriverNoShowResponseDto })
  @ApiConflictResponse({
    description: 'Aún no transcurrió el tiempo mínimo o existe progreso',
  })
  reportDriverNoShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: ReportDriverNoShowDto,
  ): Promise<DriverNoShowResponseDto> {
    return this.rideCancellationsService.reportDriverNoShow(
      user.id,
      rideId,
      dto.continueSearching ?? true,
      dto.reasonDetail,
    );
  }

  @Get(':rideId/receipt')
  @ApiOperation({ summary: 'Consultar el comprobante del viaje finalizado' })
  @ApiOkResponse({ type: RideReceiptResponseDto })
  @ApiNotFoundResponse({
    description: 'El comprobante no existe o el viaje todavía no finalizó',
  })
  getReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<RideReceiptResponseDto> {
    return this.rideReceiptsService.getPassengerReceipt(user.id, rideId);
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
  async cancelRide(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param('rideId', ParseUUIDPipe)
    rideId: string,

    @Body()
    dto: CancelPassengerRideDto,
  ): Promise<PassengerRideResponseDto> {
    await this.rideCancellationsService.cancelByPassenger(user.id, rideId, {
      reason: PassengerCancellationReason.OTHER,
      reasonDetail: dto.reason,
    });
    return this.passengerRidesService.getRide(user.id, rideId);
  }
}
