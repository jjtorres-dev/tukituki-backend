import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { EstimateFareDto } from './dto/estimate-fare.dto';
import { FareEstimateResponseDto } from './dto/fare-estimate-response.dto';
import { FaresService } from './fares.service';

@ApiTags('Fares')
@ApiBearerAuth()
@Controller('fares')
@Roles(UserRole.PASSENGER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class FaresController {
  constructor(private readonly faresService: FaresService) {}

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
