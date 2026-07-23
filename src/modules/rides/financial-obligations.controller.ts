import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { FinancialObligationQueryDto } from './dto/financial-obligation-query.dto';
import { FinancialObligationListResponseDto } from './dto/financial-obligation-response.dto';
import { FinancialObligationsService } from './financial-obligations.service';

@ApiTags('Financial obligations')
@ApiBearerAuth()
@Controller('me/financial-obligations')
@Roles(...Object.values(UserRole))
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancialObligationsController {
  constructor(private readonly service: FinancialObligationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar obligaciones financieras pendientes e históricas',
  })
  @ApiOkResponse({ type: FinancialObligationListResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FinancialObligationQueryDto,
  ): Promise<FinancialObligationListResponseDto> {
    return this.service.list(user.id, query);
  }
}
