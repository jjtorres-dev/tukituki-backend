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
import { DisputeCashPaymentDto } from './dto/dispute-cash-payment.dto';
import { RidePaymentResponseDto } from './dto/ride-payment-response.dto';

@ApiTags('Passenger cash payments')
@ApiBearerAuth()
@Controller('passenger/rides')
@Roles(UserRole.PASSENGER)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
export class PassengerCashPaymentsController {
  constructor(private readonly service: CashPaymentsService) {}

  @Get(':rideId/payment')
  @ApiOperation({ summary: 'Consultar el pago de un viaje propio' })
  @ApiOkResponse({ type: RidePaymentResponseDto })
  @ApiNotFoundResponse()
  getPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<RidePaymentResponseDto> {
    return this.service.getPassengerPayment(user.id, rideId);
  }

  @Post(':rideId/payment/cash/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reportar una discrepancia sobre un efectivo confirmado',
  })
  @ApiOkResponse({ type: RidePaymentResponseDto })
  @ApiConflictResponse({
    description: 'El pago aún no fue confirmado o ya tiene otra disputa',
  })
  @ApiNotFoundResponse()
  disputeCash(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: DisputeCashPaymentDto,
  ): Promise<RidePaymentResponseDto> {
    return this.service.disputeCash(user.id, rideId, dto);
  }
}
