import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { DriverSettlementsService } from './driver-settlements.service';
import { CreateDriverSettlementDto } from './dto/create-driver-settlement.dto';
import {
  ApproveSettlementDto,
  CancelSettlementDto,
  CompleteSettlementDto,
} from './dto/settlement-action.dto';
import { AdminSettlementQueryDto } from './dto/settlement-query.dto';
import {
  DriverSettlementDetailResponseDto,
  DriverSettlementListResponseDto,
  DriverSettlementResponseDto,
} from './dto/settlement-response.dto';

@ApiTags('Admin driver settlements')
@ApiBearerAuth()
@Controller('admin/driver-settlements')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
export class AdminDriverSettlementsController {
  constructor(private readonly service: DriverSettlementsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar y filtrar liquidaciones de conductores' })
  @ApiOkResponse({ type: DriverSettlementListResponseDto })
  list(
    @Query() query: AdminSettlementQueryDto,
  ): Promise<DriverSettlementListResponseDto> {
    return this.service.listForAdmin(query);
  }

  @Get(':settlementId')
  @ApiOperation({ summary: 'Consultar una liquidacion con sus viajes' })
  @ApiOkResponse({ type: DriverSettlementDetailResponseDto })
  @ApiNotFoundResponse()
  detail(
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
  ): Promise<DriverSettlementDetailResponseDto> {
    return this.service.detailForAdmin(settlementId);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Generar un borrador idempotente con comisiones elegibles',
  })
  @ApiCreatedResponse({ type: DriverSettlementDetailResponseDto })
  @ApiConflictResponse()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateDriverSettlementDto,
  ): Promise<DriverSettlementDetailResponseDto> {
    return this.service.create(user.id, idempotencyKey, dto);
  }

  @Post(':settlementId/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Aprobar una liquidacion calculada' })
  @ApiOkResponse({ type: DriverSettlementResponseDto })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Body() dto: ApproveSettlementDto,
  ): Promise<DriverSettlementResponseDto> {
    return this.service.approve(user.id, settlementId, dto);
  }

  @Post(':settlementId/complete')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Confirmar el pago, cobro o compensacion de una liquidacion',
  })
  @ApiOkResponse({ type: DriverSettlementResponseDto })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Body() dto: CompleteSettlementDto,
  ): Promise<DriverSettlementResponseDto> {
    return this.service.complete(user.id, settlementId, dto);
  }

  @Post(':settlementId/cancel')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancelar y liberar una liquidacion no cerrada' })
  @ApiOkResponse({ type: DriverSettlementResponseDto })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Body() dto: CancelSettlementDto,
  ): Promise<DriverSettlementResponseDto> {
    return this.service.cancel(user.id, settlementId, dto);
  }
}
