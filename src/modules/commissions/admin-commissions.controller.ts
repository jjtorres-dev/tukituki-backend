import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
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
import { CommissionPolicyService } from './commission-policy.service';
import { CommissionsService } from './commissions.service';
import { AdminCommissionQueryDto } from './dto/commission-query.dto';
import {
  CommissionListResponseDto,
  CommissionPolicyResponseDto,
  CommissionSummaryResponseDto,
} from './dto/commission-response.dto';
import { UpdateCommissionPolicyDto } from './dto/update-commission-policy.dto';

@ApiTags('Admin commissions')
@ApiBearerAuth()
@Controller('admin/commissions')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse()
export class AdminCommissionsController {
  constructor(
    private readonly service: CommissionsService,
    private readonly policyService: CommissionPolicyService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar y filtrar comisiones de viajes' })
  @ApiOkResponse({ type: CommissionListResponseDto })
  list(
    @Query() query: AdminCommissionQueryDto,
  ): Promise<CommissionListResponseDto> {
    return this.service.listForAdmin(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Consultar ingresos y comisiones consolidados' })
  @ApiOkResponse({ type: CommissionSummaryResponseDto })
  summary(
    @Query() query: AdminCommissionQueryDto,
  ): Promise<CommissionSummaryResponseDto> {
    return this.service.summaryForAdmin(query);
  }

  @Get('policy')
  @ApiOperation({ summary: 'Consultar la política de comisión vigente' })
  @ApiOkResponse({ type: CommissionPolicyResponseDto })
  currentPolicy(): Promise<CommissionPolicyResponseDto> {
    return this.policyService.getCurrent();
  }

  @Patch('policy')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Cambiar inmediatamente la comisión entre 3% y 5%',
  })
  @ApiOkResponse({ type: CommissionPolicyResponseDto })
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCommissionPolicyDto,
  ): Promise<CommissionPolicyResponseDto> {
    return this.policyService.replaceCurrent(user.id, dto);
  }
}
