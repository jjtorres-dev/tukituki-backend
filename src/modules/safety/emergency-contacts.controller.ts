import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { EmergencyContactResponseDto } from './dto/emergency-contact-response.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';
import { EmergencyContactsService } from './emergency-contacts.service';

@ApiTags('Emergency contacts')
@ApiBearerAuth()
@Controller('me/emergency-contacts')
@UseGuards(JwtAuthGuard)
export class EmergencyContactsController {
  constructor(private readonly service: EmergencyContactsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un contacto de emergencia' })
  @ApiCreatedResponse({ type: EmergencyContactResponseDto })
  @ApiConflictResponse()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmergencyContactDto,
  ): Promise<EmergencyContactResponseDto> {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar contactos de emergencia propios' })
  @ApiOkResponse({ type: [EmergencyContactResponseDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergencyContactResponseDto[]> {
    return this.service.list(user.id);
  }

  @Patch(':contactId')
  @ApiOperation({ summary: 'Actualizar un contacto de emergencia' })
  @ApiOkResponse({ type: EmergencyContactResponseDto })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateEmergencyContactDto,
  ): Promise<EmergencyContactResponseDto> {
    return this.service.update(user.id, contactId, dto);
  }

  @Patch(':contactId/primary')
  @ApiOperation({ summary: 'Marcar un contacto como principal' })
  @ApiOkResponse({ type: EmergencyContactResponseDto })
  @ApiNotFoundResponse()
  setPrimary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<EmergencyContactResponseDto> {
    return this.service.setPrimary(user.id, contactId);
  }

  @Delete(':contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un contacto de emergencia' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<void> {
    return this.service.remove(user.id, contactId);
  }
}
