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
import { CashPaymentsService } from './cash-payments.service';
import { ConfirmCashPaymentDto } from './dto/confirm-cash-payment.dto';
import { RidePaymentResponseDto } from './dto/ride-payment-response.dto';

@ApiTags('Driver cash payments')
@ApiBearerAuth()
@Controller('drivers/me/rides')
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
export class DriverCashPaymentsController {
  constructor(private readonly service: CashPaymentsService) {}

  @Get(':rideId/payment')
  @ApiOperation({ summary: 'Consultar el pago de un viaje propio' })
  @ApiOkResponse({ type: RidePaymentResponseDto })
  @ApiNotFoundResponse()
  getPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<RidePaymentResponseDto> {
    return this.service.getDriverPayment(user.id, rideId);
  }

  @Post(':rideId/payment/cash/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar la recepción del efectivo y calcular el vuelto',
  })
  @ApiOkResponse({ type: RidePaymentResponseDto })
  @ApiBadRequestResponse({
    description: 'El efectivo no cubre la tarifa final',
  })
  @ApiConflictResponse({
    description: 'Pago ya confirmado con otro importe, disputado o anulado',
  })
  @ApiNotFoundResponse()
  confirmCash(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: ConfirmCashPaymentDto,
  ): Promise<RidePaymentResponseDto> {
    return this.service.confirmCash(user.id, rideId, dto);
  }
}
