import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { EstimateFareDto } from './dto/estimate-fare.dto';
import { FareEstimateResponseDto } from './dto/fare-estimate-response.dto';
import {
  OriginAddressQueryDto,
  OriginAddressResponseDto,
} from './dto/origin-address.dto';
import { FaresService } from './fares.service';
import { OriginAddressService } from './origin-address.service';

@ApiTags('Fares')
@ApiBearerAuth()
@Controller('fares')
@Roles(UserRole.PASSENGER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class FaresController {
  constructor(
    private readonly faresService: FaresService,

    private readonly originAddressService: OriginAddressService,
  ) {}

  @Get('origin-address')
  @ApiOperation({
    summary:
      'Resolver la dirección real de un punto GPS, sin generar una cotización',
    description:
      'Reverse geocoding liviano para mostrar la dirección real del origen apenas la app obtiene el GPS, antes de que el pasajero elija destino. No persiste nada — a diferencia de POST fares/estimate, no crea un FareQuote.',
  })
  @ApiOkResponse({
    type: OriginAddressResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'latitude/longitude inválidos o fuera de rango',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiTooManyRequestsResponse({
    description:
      'El pasajero superó el límite de solicitudes de dirección de origen para la ventana vigente',
  })
  async getOriginAddress(
    @CurrentUser()
    user: AuthenticatedUser,

    @Query()
    query: OriginAddressQueryDto,
  ): Promise<OriginAddressResponseDto> {
    const address = await this.originAddressService.resolve(
      user.id,
      query.latitude,
      query.longitude,
    );

    return { address };
  }

  @Post('estimate')
  @ApiOperation({
    summary: 'Calcular y persistir una cotización temporal de viaje',
    description:
      'La cotización pertenece al pasajero autenticado y expira después de cinco minutos.',
  })
  @ApiCreatedResponse({
    type: FareEstimateResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Origen o destino fuera de cobertura, ruta inválida o tarifa no disponible',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  estimate(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: EstimateFareDto,
  ): Promise<FareEstimateResponseDto> {
    return this.faresService.estimate(user.id, dto);
  }
}
