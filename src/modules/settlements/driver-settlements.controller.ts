import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { SettlementQueryDto } from './dto/settlement-query.dto';
import {
  DriverSettlementBalanceResponseDto,
  DriverSettlementDetailResponseDto,
  DriverSettlementListResponseDto,
} from './dto/settlement-response.dto';

@ApiTags('Driver settlements')
@ApiBearerAuth()
@Controller('drivers/me/settlements')
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
export class DriverSettlementsController {
  constructor(private readonly service: DriverSettlementsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar mis liquidaciones' })
  @ApiOkResponse({ type: DriverSettlementListResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SettlementQueryDto,
  ): Promise<DriverSettlementListResponseDto> {
    return this.service.listForDriver(user.id, query);
  }

  @Get('balance')
  @ApiOperation({ summary: 'Consultar mi saldo disponible y reservado' })
  @ApiOkResponse({ type: DriverSettlementBalanceResponseDto })
  balance(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverSettlementBalanceResponseDto> {
    return this.service.balanceForDriver(user.id);
  }

  @Get(':settlementId')
  @ApiOperation({ summary: 'Consultar el detalle de mi liquidacion' })
  @ApiOkResponse({ type: DriverSettlementDetailResponseDto })
  @ApiNotFoundResponse()
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
  ): Promise<DriverSettlementDetailResponseDto> {
    return this.service.detailForDriver(user.id, settlementId);
  }
}
