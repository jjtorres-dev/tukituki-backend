import {
  Body,
  Controller,
  Get,
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
    summary: 'Listar ofertas vigentes del conductor',
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

  @Get(':offerId')
  @ApiOperation({
    summary: 'Consultar una oferta propia',
  })
  @ApiOkResponse({
    type: DriverRideOfferResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'La oferta no existe o no pertenece al conductor',
  })
  getOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ): Promise<DriverRideOfferResponseDto> {
    return this.driverRideOffersService.getOffer(user.id, offerId);
  }

  @Post(':offerId/accept')
  @ApiOperation({
    summary: 'Aceptar una oferta de viaje',
  })
  @ApiOkResponse({
    type: DriverRideOfferResponseDto,
  })
  @ApiConflictResponse({
    description:
      'La oferta venció, el viaje fue asignado o el conductor ya no está disponible',
  })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  acceptOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ): Promise<DriverRideOfferResponseDto> {
    return this.driverRideOffersService.acceptOffer(user.id, offerId);
  }

  @Post(':offerId/reject')
  @ApiOperation({
    summary: 'Rechazar una oferta de viaje',
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
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: RejectRideOfferDto,
  ): Promise<DriverRideOfferResponseDto> {
    return this.driverRideOffersService.rejectOffer(user.id, offerId, dto);
  }
}
