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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateFareRuleDto } from './dto/create-fare-rule.dto';
import {
  FareRuleListResponseDto,
  FareRuleResponseDto,
} from './dto/fare-rule-response.dto';
import { FareRuleQueryDto } from './dto/fare-rule-query.dto';
import { UpdateFareRuleDto } from './dto/update-fare-rule.dto';
import { FareRulesService } from './fare-rules.service';

@ApiTags('Admin fare rules')
@ApiBearerAuth()
@Controller('admin/fare-rules')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminFareRulesController {
  constructor(private readonly fareRulesService: FareRulesService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear una regla tarifaria en estado DRAFT',
  })
  @ApiOkResponse({
    type: FareRuleResponseDto,
  })
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  create(
    @Body()
    dto: CreateFareRuleDto,
  ): Promise<FareRuleResponseDto> {
    return this.fareRulesService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar reglas tarifarias',
  })
  @ApiOkResponse({
    type: FareRuleListResponseDto,
  })
  list(
    @Query()
    query: FareRuleQueryDto,
  ): Promise<FareRuleListResponseDto> {
    return this.fareRulesService.list(query);
  }

  @Get(':fareRuleId')
  @ApiOperation({
    summary: 'Consultar una regla tarifaria',
  })
  @ApiOkResponse({
    type: FareRuleResponseDto,
  })
  @ApiNotFoundResponse()
  getById(
    @Param(
      'fareRuleId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    fareRuleId: string,
  ): Promise<FareRuleResponseDto> {
    return this.fareRulesService.getById(fareRuleId);
  }

  @Patch(':fareRuleId')
  @ApiOperation({
    summary: 'Actualizar una regla tarifaria',
  })
  @ApiOkResponse({
    type: FareRuleResponseDto,
  })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  @ApiNotFoundResponse()
  update(
    @Param(
      'fareRuleId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    fareRuleId: string,

    @Body()
    dto: UpdateFareRuleDto,
  ): Promise<FareRuleResponseDto> {
    return this.fareRulesService.update(fareRuleId, dto);
  }

  @Patch(':fareRuleId/activate')
  @ApiOperation({
    summary: 'Activar una regla tarifaria sin superponer periodos',
  })
  @ApiOkResponse({
    type: FareRuleResponseDto,
  })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  activate(
    @Param(
      'fareRuleId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    fareRuleId: string,
  ): Promise<FareRuleResponseDto> {
    return this.fareRulesService.activate(fareRuleId);
  }

  @Patch(':fareRuleId/deactivate')
  @ApiOperation({
    summary: 'Desactivar una regla tarifaria',
  })
  @ApiOkResponse({
    type: FareRuleResponseDto,
  })
  deactivate(
    @Param(
      'fareRuleId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    fareRuleId: string,
  ): Promise<FareRuleResponseDto> {
    return this.fareRulesService.deactivate(fareRuleId);
  }
}
