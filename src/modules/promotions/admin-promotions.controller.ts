import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
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
import {
  CreatePromotionDto,
  PromotionQueryDto,
  UpdatePromotionDto,
} from './dto/promotion.dto';
import {
  PromotionListResponseDto,
  PromotionResponseDto,
} from './dto/promotion-response.dto';
import { PromotionsService } from './promotions.service';

@ApiTags('Admin promotions')
@ApiBearerAuth()
@Controller('admin/promotions')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar promociones y sus usos' })
  @ApiOkResponse({ type: PromotionListResponseDto })
  list(@Query() query: PromotionQueryDto): Promise<PromotionListResponseDto> {
    return this.promotions.list(query);
  }

  @Get(':promotionId')
  @ApiOperation({ summary: 'Consultar una promocion' })
  @ApiOkResponse({ type: PromotionResponseDto })
  detail(
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
  ): Promise<PromotionResponseDto> {
    return this.promotions.detail(promotionId);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Crear una promocion o cupon' })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePromotionDto,
  ): Promise<PromotionResponseDto> {
    return this.promotions.create(user.id, dto);
  }

  @Patch(':promotionId')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Editar, activar o pausar una promocion' })
  @ApiOkResponse({ type: PromotionResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
    @Body() dto: UpdatePromotionDto,
  ): Promise<PromotionResponseDto> {
    return this.promotions.update(user.id, promotionId, dto);
  }
}
