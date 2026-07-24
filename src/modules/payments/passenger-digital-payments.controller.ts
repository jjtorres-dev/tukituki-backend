import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { DigitalPaymentsService } from './digital-payments.service';
import { CreateDigitalCheckoutSessionDto } from './dto/create-digital-checkout-session.dto';
import { DigitalCheckoutSessionResponseDto } from './dto/digital-checkout-session-response.dto';

@ApiTags('Passenger digital payments')
@ApiBearerAuth()
@Controller('passenger/rides')
@Roles(UserRole.PASSENGER)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
export class PassengerDigitalPaymentsController {
  constructor(private readonly service: DigitalPaymentsService) {}

  @Post(':rideId/payment/digital/session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Crear o recuperar una sesión idempotente de checkout Izipay',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Clave única de 8 a 100 caracteres por intento del cliente.',
  })
  @ApiOkResponse({ type: DigitalCheckoutSessionResponseDto })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  @ApiNotFoundResponse()
  @ApiBadGatewayResponse()
  @ApiServiceUnavailableResponse()
  createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateDigitalCheckoutSessionDto,
  ): Promise<DigitalCheckoutSessionResponseDto> {
    return this.service.createCheckoutSession(
      user.id,
      rideId,
      idempotencyKey,
      dto,
    );
  }
}
