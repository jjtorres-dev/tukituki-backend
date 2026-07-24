import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
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
import { AdminPaymentQueryDto } from './dto/admin-payment-query.dto';
import { ResolveCashPaymentDto } from './dto/resolve-cash-payment.dto';
import {
  RidePaymentListResponseDto,
  RidePaymentResponseDto,
} from './dto/ride-payment-response.dto';

@ApiTags('Admin cash payments')
@ApiBearerAuth()
@Controller('admin/payments')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
export class AdminCashPaymentsController {
  constructor(private readonly service: CashPaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar y filtrar los pagos de viajes' })
  @ApiOkResponse({ type: RidePaymentListResponseDto })
  list(
    @Query() query: AdminPaymentQueryDto,
  ): Promise<RidePaymentListResponseDto> {
    return this.service.listAdmin(query);
  }

  @Patch(':paymentId/resolve')
  @ApiOperation({ summary: 'Resolver una disputa de pago en efectivo' })
  @ApiOkResponse({ type: RidePaymentResponseDto })
  @ApiConflictResponse({
    description: 'El pago no se encuentra disputado',
  })
  @ApiNotFoundResponse()
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: ResolveCashPaymentDto,
  ): Promise<RidePaymentResponseDto> {
    return this.service.resolveDispute(user.id, paymentId, dto);
  }
}
