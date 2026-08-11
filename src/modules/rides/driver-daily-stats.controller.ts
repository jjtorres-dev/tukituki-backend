import { Controller, Get, UseGuards } from '@nestjs/common';
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
import { DriverDailyStatsResponseDto } from './dto/driver-daily-stats-response.dto';
import { DriverDailyStatsService } from './driver-daily-stats.service';

@ApiTags('Driver stats')
@ApiBearerAuth()
@Controller('drivers/me/stats')
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverDailyStatsController {
  constructor(
    private readonly driverDailyStatsService: DriverDailyStatsService,
  ) {}

  @Get('daily')
  @ApiOperation({
    summary: 'Ganado hoy y viajes completados hoy (America/Lima)',
  })
  @ApiOkResponse({
    type: DriverDailyStatsResponseDto,
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  getDailyStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverDailyStatsResponseDto> {
    return this.driverDailyStatsService.getDailyStats(user.id);
  }
}
