import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
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
import { CommissionsService } from './commissions.service';
import { CommissionQueryDto } from './dto/commission-query.dto';
import {
  CommissionListResponseDto,
  CommissionSummaryResponseDto,
} from './dto/commission-response.dto';

@ApiTags('Driver commissions')
@ApiBearerAuth()
@Controller('drivers/me/commissions')
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
export class DriverCommissionsController {
  constructor(private readonly service: CommissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar las comisiones de mis viajes' })
  @ApiOkResponse({ type: CommissionListResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CommissionQueryDto,
  ): Promise<CommissionListResponseDto> {
    return this.service.listForDriver(user.id, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Consultar mi resumen de ingresos y comisiones' })
  @ApiOkResponse({ type: CommissionSummaryResponseDto })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CommissionQueryDto,
  ): Promise<CommissionSummaryResponseDto> {
    return this.service.summaryForDriver(user.id, query);
  }
}
