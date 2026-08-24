import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiFoundResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CompleteUploadResponseDto } from './dto/complete-upload-response.dto';
import { CreatePresignedUploadDto } from './dto/create-presigned-upload.dto';
import { DownloadUrlResponseDto } from './dto/download-url-response.dto';
import { PresignedUploadResponseDto } from './dto/presigned-upload-response.dto';
import { StorageService } from './storage.service';

@ApiTags('Storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('uploads/presign')
  @ApiBearerAuth()
  @Roles(UserRole.PASSENGER, UserRole.DRIVER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary:
      'Generar una URL presignada para subir un archivo a Railway Storage',
  })
  @ApiOkResponse({ type: PresignedUploadResponseDto })
  @ApiBadRequestResponse({
    description: 'Categoría, MIME type o tamaño no permitidos',
  })
  @ApiForbiddenResponse({
    description:
      'El usuario no puede subir un archivo de esta categoría todavía',
  })
  @ApiServiceUnavailableResponse({
    description: 'El almacenamiento no está habilitado en este ambiente',
  })
  @ApiUnauthorizedResponse()
  presign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePresignedUploadDto,
  ): Promise<PresignedUploadResponseDto> {
    return this.storageService.createPresignedUpload(user.id, dto);
  }

  @Post('uploads/complete')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles(UserRole.PASSENGER, UserRole.DRIVER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary:
      'Confirmar una subida ya realizada al bucket y vincularla al dominio',
  })
  @ApiOkResponse({ type: CompleteUploadResponseDto })
  @ApiBadRequestResponse({
    description: 'El archivo no existe en el bucket o no cumple MIME/tamaño',
  })
  @ApiForbiddenResponse({
    description: 'El objectKey no corresponde a este usuario o categoría',
  })
  @ApiServiceUnavailableResponse({
    description: 'El almacenamiento no está habilitado en este ambiente',
  })
  @ApiUnauthorizedResponse()
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteUploadDto,
  ): Promise<CompleteUploadResponseDto> {
    return this.storageService.completeUpload(user.id, dto);
  }

  @Get('documents/me/:documentId/download-url')
  @ApiBearerAuth()
  @Roles(UserRole.PASSENGER, UserRole.DRIVER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Obtener una URL temporal para leer un documento propio',
  })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  @ApiNotFoundResponse({ description: 'El documento no existe' })
  @ApiUnauthorizedResponse()
  getMyDocumentDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ): Promise<DownloadUrlResponseDto> {
    return this.storageService.getMyDocumentDownloadUrl(user.id, documentId);
  }

  @Get('admin/documents/:documentId/download-url')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary:
      'Obtener una URL temporal para revisar el documento de un conductor',
  })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  @ApiNotFoundResponse({ description: 'El documento no existe' })
  @ApiForbiddenResponse({
    description: 'Se requiere el rol ADMIN o SUPER_ADMIN',
  })
  @ApiUnauthorizedResponse()
  getDocumentDownloadUrlForAdmin(
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ): Promise<DownloadUrlResponseDto> {
    return this.storageService.getDocumentDownloadUrlForAdmin(documentId);
  }

  /*
   * STORAGE-R2.1: NO son endpoints públicos genéricos por profileId.
   * El profileId por sí solo (UUID conocido o adivinado) nunca alcanza
   * — StorageService exige además un capability token firmado y no
   * vencido (?token=...), que el Backend solo emite dentro de una
   * respuesta ya autorizada (ride propio, historial propio, share-link
   * de viaje válido, admin). Sin JwtAuthGuard a propósito: Flutter
   * carga estas imágenes con Image.network(url) sin poder adjuntar el
   * header Authorization (ver decisiones.md), por eso la autorización
   * viaja en el propio token de la URL, no en un header.
   */
  @Get('avatars/driver/:driverProfileId')
  @Redirect()
  @ApiOperation({
    summary:
      'Redirigir a una URL presignada temporal de la foto del conductor (requiere ?token= vigente)',
  })
  @ApiParam({ name: 'driverProfileId', format: 'uuid' })
  @ApiQuery({
    name: 'token',
    description:
      'Capability token firmado, emitido por el Backend en un contexto autorizado',
  })
  @ApiFoundResponse({
    description: 'Redirección a la presigned GET del avatar',
  })
  @ApiForbiddenResponse({ description: 'Token inválido, vencido o ausente' })
  @ApiNotFoundResponse({ description: 'El conductor no tiene foto disponible' })
  async getDriverAvatar(
    @Param('driverProfileId', new ParseUUIDPipe({ version: '4' }))
    driverProfileId: string,
    @Query('token') token: string,
  ): Promise<{ url: string; statusCode: number }> {
    const url = await this.storageService.getDriverAvatarRedirectUrl(
      driverProfileId,
      token,
    );

    return { url, statusCode: HttpStatus.FOUND };
  }

  @Get('avatars/passenger/:passengerProfileId')
  @Redirect()
  @ApiOperation({
    summary:
      'Redirigir a una URL presignada temporal de la foto del pasajero (requiere ?token= vigente)',
  })
  @ApiParam({ name: 'passengerProfileId', format: 'uuid' })
  @ApiQuery({
    name: 'token',
    description:
      'Capability token firmado, emitido por el Backend en un contexto autorizado',
  })
  @ApiFoundResponse({
    description: 'Redirección a la presigned GET del avatar',
  })
  @ApiForbiddenResponse({ description: 'Token inválido, vencido o ausente' })
  @ApiNotFoundResponse({ description: 'El pasajero no tiene foto disponible' })
  async getPassengerAvatar(
    @Param('passengerProfileId', new ParseUUIDPipe({ version: '4' }))
    passengerProfileId: string,
    @Query('token') token: string,
  ): Promise<{ url: string; statusCode: number }> {
    const url = await this.storageService.getPassengerAvatarRedirectUrl(
      passengerProfileId,
      token,
    );

    return { url, statusCode: HttpStatus.FOUND };
  }
}
