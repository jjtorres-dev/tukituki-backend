import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
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
import { CreatePassengerProfileDto } from './dto/create-passenger-profile.dto';
import { PassengerProfileResponseDto } from './dto/passenger-profile-response.dto';
import { UpdatePassengerProfileDto } from './dto/update-passenger-profile.dto';
import { PassengersService } from './passengers.service';

@ApiTags('Passengers')
@ApiBearerAuth()
@Controller('passengers')
@Roles(UserRole.PASSENGER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class PassengersController {
  constructor(private readonly passengersService: PassengersService) {}

  @Post('me')
  @ApiOperation({
    summary: 'Crear el perfil del pasajero autenticado',
  })
  @ApiCreatedResponse({
    description: 'Perfil creado correctamente',
    type: PassengerProfileResponseDto,
  })
  @ApiConflictResponse({
    description: 'El pasajero ya tiene un perfil',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token inexistente o inválido',
  })
  @ApiForbiddenResponse({
    description: 'La cuenta no posee el rol PASSENGER',
  })
  async createMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePassengerProfileDto,
  ): Promise<PassengerProfileResponseDto> {
    const profile = await this.passengersService.createMyProfile(user.id, dto);

    return this.passengersService.toProfileResponse(profile, user.phoneE164);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Obtener el perfil del pasajero autenticado',
  })
  @ApiOkResponse({
    type: PassengerProfileResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'El perfil todavía no existe',
  })
  async getMyProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PassengerProfileResponseDto> {
    const profile = await this.passengersService.getMyProfile(user.id);

    return this.passengersService.toProfileResponse(profile, user.phoneE164);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Actualizar el perfil del pasajero autenticado',
  })
  @ApiOkResponse({
    description: 'Perfil actualizado correctamente',
    type: PassengerProfileResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'El perfil todavía no existe',
  })
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePassengerProfileDto,
  ): Promise<PassengerProfileResponseDto> {
    const profile = await this.passengersService.updateMyProfile(user.id, dto);

    return this.passengersService.toProfileResponse(profile, user.phoneE164);
  }
}
