import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminDriverReviewService } from './admin-driver-review.service';
import { AdminDriversService } from './admin-drivers.service';
import { AdminDriverDetailResponseDto } from './dto/admin-driver-detail-response.dto';
import { AdminDriverListResponseDto } from './dto/admin-driver-list-response.dto';
import { AdminDriverQueryDto } from './dto/admin-driver-query.dto';
import { RejectDriverApplicationDto } from './dto/reject-driver-application.dto';
import { SuspendDriverDto } from './dto/suspend-driver.dto';

@ApiTags('Admin drivers')
@ApiBearerAuth()
@Controller('admin/drivers')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminDriversController {
  constructor(
    private readonly adminDriversService: AdminDriversService,

    private readonly reviewService: AdminDriverReviewService,
  ) {}

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

  @Patch(':driverProfileId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aprobar una solicitud de conductor',
  })
  @ApiParam({
    name: 'driverProfileId',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Solicitud aprobada y rol DRIVER asignado',
    type: AdminDriverDetailResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'La solicitud no está pendiente o el expediente es inválido',
  })
  @ApiNotFoundResponse({
    description: 'La solicitud no existe',
  })
  async approve(
    @CurrentUser()
    admin: AuthenticatedUser,

    @Param(
      'driverProfileId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverProfileId: string,
  ): Promise<AdminDriverDetailResponseDto> {
    await this.reviewService.approve(driverProfileId, admin.id);

    return this.adminDriversService.getDetail(driverProfileId);
  }

  @Patch(':driverProfileId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rechazar una solicitud con observaciones',
  })
  @ApiParam({
    name: 'driverProfileId',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Solicitud rechazada correctamente',
    type: AdminDriverDetailResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'La solicitud no está pendiente o las observaciones son inválidas',
  })
  async reject(
    @CurrentUser()
    admin: AuthenticatedUser,

    @Param(
      'driverProfileId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverProfileId: string,

    @Body()
    dto: RejectDriverApplicationDto,
  ): Promise<AdminDriverDetailResponseDto> {
    await this.reviewService.reject(driverProfileId, admin.id, dto);

    return this.adminDriversService.getDetail(driverProfileId);
  }

  @Patch(':driverProfileId/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspender a un conductor aprobado',
  })
  @ApiParam({
    name: 'driverProfileId',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Conductor suspendido y rol DRIVER retirado',
    type: AdminDriverDetailResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El conductor no se encuentra aprobado',
  })
  async suspend(
    @CurrentUser()
    admin: AuthenticatedUser,

    @Param(
      'driverProfileId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    driverProfileId: string,

    @Body()
    dto: SuspendDriverDto,
  ): Promise<AdminDriverDetailResponseDto> {
    await this.reviewService.suspend(driverProfileId, admin.id, dto.reason);

    return this.adminDriversService.getDetail(driverProfileId);
  }
}
