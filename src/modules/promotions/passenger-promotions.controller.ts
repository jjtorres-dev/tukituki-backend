import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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
import { ValidatePromotionDto } from './dto/promotion.dto';
import { PromotionValidationResponseDto } from './dto/promotion-response.dto';
import { PromotionsService } from './promotions.service';

@ApiTags('Passenger promotions')
@ApiBearerAuth()
@Controller('passenger/promotions')
@Roles(UserRole.PASSENGER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class PassengerPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validar un cupon contra una cotizacion vigente' })
  @ApiOkResponse({ type: PromotionValidationResponseDto })
  validate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidatePromotionDto,
  ): Promise<PromotionValidationResponseDto> {
    return this.promotions.validateForQuote(user.id, dto.fareQuoteId, dto.code);
  }
}
