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
  ApiNotFoundResponse,
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
import { AdminRideCancellationQueryDto } from './dto/admin-ride-cancellation-query.dto';
import {
  RideCancellationListResponseDto,
  RideCancellationResponseDto,
} from './dto/ride-cancellation-response.dto';
import { WaiveCancellationFeeDto } from './dto/waive-cancellation-fee.dto';
import { RideCancellationsService } from './ride-cancellations.service';

@ApiTags('Admin ride cancellations')
@ApiBearerAuth()
@Controller('admin/ride-cancellations')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminRideCancellationsController {
  constructor(private readonly service: RideCancellationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar cancelaciones de viajes' })
  @ApiOkResponse({ type: RideCancellationListResponseDto })
  list(
    @Query() query: AdminRideCancellationQueryDto,
  ): Promise<RideCancellationListResponseDto> {
    return this.service.listAdmin(query);
  }

  @Get(':cancellationId')
  @ApiOperation({ summary: 'Consultar una cancelación' })
  @ApiOkResponse({ type: RideCancellationResponseDto })
  @ApiNotFoundResponse()
  getOne(
    @Param('cancellationId', ParseUUIDPipe) cancellationId: string,
  ): Promise<RideCancellationResponseDto> {
    return this.service.getAdmin(cancellationId);
  }

  @Patch(':cancellationId/waive-fee')
  @ApiOperation({ summary: 'Exonerar una tarifa de cancelación pendiente' })
  @ApiOkResponse({ type: RideCancellationResponseDto })
  @ApiConflictResponse({ description: 'La tarifa ya no está pendiente' })
  waive(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('cancellationId', ParseUUIDPipe) cancellationId: string,
    @Body() dto: WaiveCancellationFeeDto,
  ): Promise<RideCancellationResponseDto> {
    return this.service.waiveFee(admin.id, cancellationId, dto.reason);
  }
}
