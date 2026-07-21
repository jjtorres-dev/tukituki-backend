import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
import { CreateDriverProfileDto } from './dto/create-driver-profile.dto';
import { DriverProfileResponseDto } from './dto/driver-profile-response.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { DriversService } from './drivers.service';
import { DriverApplicationSubmissionService } from './driver-application-submission.service';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
@Roles(UserRole.PASSENGER, UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriversController {
  constructor(
    private readonly driversService: DriversService,

    private readonly submissionService: DriverApplicationSubmissionService,
  ) {}

  @Post('me')
  @ApiOperation({
    summary: 'Crear la solicitud de conductor',
  })
  @ApiCreatedResponse({
    description: 'Solicitud creada como borrador',
    type: DriverProfileResponseDto,
  })
  @ApiConflictResponse({
    description: 'Ya existe una solicitud o documento registrado',
  })
  @ApiBadRequestResponse({
    description: 'Los datos o la edad no son válidos',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token inexistente o inválido',
  })
  @ApiForbiddenResponse({
    description: 'La cuenta no posee un rol permitido',
  })
  createMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDriverProfileDto,
  ): Promise<DriverProfileResponseDto> {
    return this.driversService.createMyProfile(user.id, dto);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Consultar la solicitud del conductor',
  })
  @ApiOkResponse({
    type: DriverProfileResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'La solicitud todavía no existe',
  })
  getMyProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverProfileResponseDto> {
    return this.driversService.getMyProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Actualizar la solicitud del conductor',
  })
  @ApiOkResponse({
    description: 'Solicitud actualizada correctamente',
    type: DriverProfileResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'La solicitud no puede modificarse en su estado actual',
  })
  @ApiNotFoundResponse({
    description: 'La solicitud todavía no existe',
  })
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDriverProfileDto,
  ): Promise<DriverProfileResponseDto> {
    return this.driversService.updateMyProfile(user.id, dto);
  }

  @Post('me/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar la solicitud completa a revisión administrativa',
  })
  @ApiOkResponse({
    description: 'Perfil, vehículo y documentos enviados a revisión',
    type: DriverProfileResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'La solicitud está incompleta, contiene requisitos inválidos o no puede enviarse',
  })
  @ApiNotFoundResponse({
    description: 'La solicitud del conductor todavía no existe',
  })
  submitMyProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverProfileResponseDto> {
    return this.submissionService.submit(user.id);
  }
}
