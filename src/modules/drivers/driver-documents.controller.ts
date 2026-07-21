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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { DriverDocumentResponseDto } from './dto/driver-document-response.dto';
import { UpdateDriverDocumentDto } from './dto/update-driver-document.dto';
import { DriverDocumentsService } from './driver-documents.service';

@ApiTags('Driver documents')
@ApiBearerAuth()
@Controller('drivers/me/documents')
@Roles(UserRole.PASSENGER, UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverDocumentsController {
  constructor(
    private readonly driverDocumentsService: DriverDocumentsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar un documento del conductor',
  })
  @ApiCreatedResponse({
    description: 'Documento registrado como borrador',
    type: DriverDocumentResponseDto,
  })
  @ApiConflictResponse({
    description: 'El tipo de documento ya fue registrado',
  })
  @ApiBadRequestResponse({
    description: 'Los datos, fechas o estado de la solicitud no son válidos',
  })
  @ApiNotFoundResponse({
    description: 'El perfil de conductor no existe',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token inexistente o inválido',
  })
  @ApiForbiddenResponse({
    description: 'La cuenta no posee un rol permitido',
  })
  createMyDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDriverDocumentDto,
  ): Promise<DriverDocumentResponseDto> {
    return this.driverDocumentsService.createMyDocument(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar los documentos del conductor',
  })
  @ApiOkResponse({
    type: DriverDocumentResponseDto,
    isArray: true,
  })
  listMyDocuments(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverDocumentResponseDto[]> {
    return this.driverDocumentsService.listMyDocuments(user.id);
  }

  @Get(':documentId')
  @ApiOperation({
    summary: 'Consultar un documento específico',
  })
  @ApiParam({
    name: 'documentId',
    format: 'uuid',
  })
  @ApiOkResponse({
    type: DriverDocumentResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'El documento no existe',
  })
  getMyDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'documentId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    documentId: string,
  ): Promise<DriverDocumentResponseDto> {
    return this.driverDocumentsService.getMyDocument(user.id, documentId);
  }

  @Patch(':documentId')
  @ApiOperation({
    summary: 'Actualizar un documento del conductor',
  })
  @ApiParam({
    name: 'documentId',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Documento actualizado correctamente',
    type: DriverDocumentResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El documento no puede modificarse o sus datos son inválidos',
  })
  @ApiNotFoundResponse({
    description: 'El documento no existe',
  })
  updateMyDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'documentId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    documentId: string,
    @Body() dto: UpdateDriverDocumentDto,
  ): Promise<DriverDocumentResponseDto> {
    return this.driverDocumentsService.updateMyDocument(
      user.id,
      documentId,
      dto,
    );
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar un documento del conductor',
  })
  @ApiParam({
    name: 'documentId',
    format: 'uuid',
  })
  @ApiNoContentResponse({
    description: 'Documento eliminado correctamente',
  })
  @ApiBadRequestResponse({
    description: 'El documento no puede eliminarse en su estado actual',
  })
  @ApiNotFoundResponse({
    description: 'El documento no existe',
  })
  async deleteMyDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'documentId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    documentId: string,
  ): Promise<void> {
    await this.driverDocumentsService.deleteMyDocument(user.id, documentId);
  }
}
