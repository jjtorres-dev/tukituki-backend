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
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminDriversService } from './admin-drivers.service';
import { AdminDriverDetailResponseDto } from './dto/admin-driver-detail-response.dto';
import { AdminDriverListResponseDto } from './dto/admin-driver-list-response.dto';
import { AdminDriverQueryDto } from './dto/admin-driver-query.dto';

@ApiTags('Admin drivers')
@ApiBearerAuth()
@Controller('admin/drivers')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminDriversController {
  constructor(private readonly adminDriversService: AdminDriversService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar solicitudes de conductores',
  })
  @ApiOkResponse({
    type: AdminDriverListResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token inexistente o inválido',
  })
  @ApiForbiddenResponse({
    description: 'Se requiere el rol ADMIN o SUPER_ADMIN',
  })
  list(
    @Query()
    query: AdminDriverQueryDto,
  ): Promise<AdminDriverListResponseDto> {
    return this.adminDriversService.list(query);
  }

  @Get(':driverProfileId')
  @ApiOperation({
    summary: 'Consultar el expediente completo de un conductor',
  })
  @ApiParam({
    name: 'driverProfileId',
    format: 'uuid',
  })
  @ApiOkResponse({
    type: AdminDriverDetailResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'La solicitud no existe',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token inexistente o inválido',
  })
  @ApiForbiddenResponse({
    description: 'Se requiere el rol ADMIN o SUPER_ADMIN',
  })
  getDetail(
    @Param(
      'driverProfileId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverProfileId: string,
  ): Promise<AdminDriverDetailResponseDto> {
    return this.adminDriversService.getDetail(driverProfileId);
  }
}
