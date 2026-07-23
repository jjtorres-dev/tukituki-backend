import {
  Body,
  Controller,
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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateSafetyIncidentDto } from './dto/create-safety-incident.dto';
import { SafetyIncidentResponseDto } from './dto/safety-incident-response.dto';
import { RideSafetyService } from './ride-safety.service';

@ApiTags('Ride safety')
@ApiBearerAuth()
@Controller('rides')
@UseGuards(JwtAuthGuard)
export class RideSafetyController {
  constructor(private readonly service: RideSafetyService) {}

  @Post(':rideId/sos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Activar SOS para un viaje propio' })
  @ApiCreatedResponse({ type: SafetyIncidentResponseDto })
  @ApiBadRequestResponse({ description: 'Ubicación inválida o no plausible' })
  @ApiForbiddenResponse({ description: 'El usuario no participa en el viaje' })
  @ApiConflictResponse({ description: 'Viaje no elegible o SOS duplicado' })
  @ApiNotFoundResponse()
  createIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: CreateSafetyIncidentDto,
  ): Promise<SafetyIncidentResponseDto> {
    return this.service.createIncident(user.id, rideId, dto);
  }
}
