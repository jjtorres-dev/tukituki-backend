import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
    summary: 'Calcular la tarifa estimada de un viaje',
    description:
      'En esta etapa distanceMeters y durationSeconds son temporales. Posteriormente vendrán del proveedor de rutas.',
  })
  @ApiOkResponse({
    type: FareEstimateResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Origen o destino fuera de cobertura, o tarifa no disponible',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  estimate(
    @Body()
    dto: EstimateFareDto,
  ): Promise<FareEstimateResponseDto> {
    return this.faresService.estimate(dto);
  }
}
