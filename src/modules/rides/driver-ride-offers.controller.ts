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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { CounterRideOfferDto } from './dto/counter-ride-offer.dto';
import { DriverPendingProposalResponseDto } from './dto/driver-pending-proposal-response.dto';
import { DriverRideOfferResponseDto } from './dto/driver-ride-offer-response.dto';
import { RejectRideOfferDto } from './dto/reject-ride-offer.dto';
import { DriverRideOffersService } from './driver-ride-offers.service';

@ApiTags('Driver ride offers')
@ApiBearerAuth()
@Controller('drivers/me/ride-offers')
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverRideOffersController {
  constructor(
    private readonly driverRideOffersService: DriverRideOffersService,
  ) {}

  @Get('active')
  @ApiOperation({
    summary: 'Listar solicitudes de viaje pendientes para el conductor',
  })
  @ApiOkResponse({
    type: DriverRideOfferResponseDto,
    isArray: true,
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  getActiveOffers(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverRideOfferResponseDto[]> {
    return this.driverRideOffersService.getActiveOffers(user.id);
  }

  /*
   * Recuperación autoritativa de propuestas PROPOSED
   * vigentes.
   *
   * Independiente de "active": nunca devuelve OFFERED,
   * y "active" nunca devuelve PROPOSED.
   */
  @Get('proposals/pending')
  @ApiOperation({
    summary:
      'Recuperar autoritativamente las propuestas PROPOSED vigentes ' +
      'del conductor',
  })
  @ApiOkResponse({
    type: DriverPendingProposalResponseDto,
    isArray: true,
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  getPendingProposals(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverPendingProposalResponseDto[]> {
    return this.driverRideOffersService.getPendingProposals(user.id);
  }

  @Get(':offerId')
  @ApiOperation({
    summary: 'Consultar una solicitud u oferta propia',
  })
  @ApiOkResponse({
    type: DriverRideOfferResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'La oferta no existe o no pertenece al conductor',
  })
  getOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offerId', ParseUUIDPipe)
    offerId: string,
  ): Promise<DriverRideOfferResponseDto> {
    return this.driverRideOffersService.getOffer(user.id, offerId);
  }

  /*
   * IMPORTANTE:
   *
   * "accept" ahora significa aceptar
   * el PRECIO del pasajero.
   *
   * Todavía NO asigna el viaje.
   */
  @Post(':offerId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aceptar el precio ofrecido por el pasajero',
  })
  @ApiOkResponse({
    type: DriverRideOfferResponseDto,
  })
  @ApiConflictResponse({
    description:
      'La oferta venció, el viaje ya no está disponible ' +
      'o el conductor ya no está disponible',
  })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  acceptOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offerId', ParseUUIDPipe)
    offerId: string,
  ): Promise<DriverRideOfferResponseDto> {
    return this.driverRideOffersService.acceptOffer(user.id, offerId);
  }

  @Post(':offerId/counter-offer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar una contraoferta de precio al pasajero',
  })
  @ApiOkResponse({
    type: DriverRideOfferResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El precio propuesto es inválido',
  })
  @ApiConflictResponse({
    description: 'La oferta venció o ya fue respondida',
  })
  @ApiNotFoundResponse()
  counterOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offerId', ParseUUIDPipe)
    offerId: string,
    @Body()
    dto: CounterRideOfferDto,
  ): Promise<DriverRideOfferResponseDto> {
    return this.driverRideOffersService.counterOffer(user.id, offerId, dto);
  }

  @Post(':offerId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rechazar una solicitud de viaje',
  })
  @ApiOkResponse({
    type: DriverRideOfferResponseDto,
  })
  @ApiConflictResponse({
    description: 'La oferta ya no se encuentra disponible',
  })
  @ApiNotFoundResponse()
  rejectOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offerId', ParseUUIDPipe)
    offerId: string,
    @Body()
    dto: RejectRideOfferDto,
  ): Promise<DriverRideOfferResponseDto> {
    return this.driverRideOffersService.rejectOffer(user.id, offerId, dto);
  }
}
