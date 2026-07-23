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
  Query,
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
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { DeviceResponseDto } from './dto/device-response.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NotificationListResponseDto,
  NotificationUnreadCountResponseDto,
} from './dto/notification-response.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { NotificationsService } from './notifications.service';
import { UserDevicesService } from './user-devices.service';

@ApiTags('Devices and notifications')
@ApiBearerAuth()
@Controller('me')
@Roles(...Object.values(UserRole))
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly userDevicesService: UserDevicesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar o actualizar un dispositivo push' })
  @ApiCreatedResponse({ type: DeviceResponseDto })
  @ApiConflictResponse({
    description: 'El token push está activo en otro dispositivo',
  })
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceResponseDto> {
    return this.userDevicesService.register(user.id, dto);
  }

  @Delete('devices/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revocar un dispositivo propio' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'El dispositivo activo no existe' })
  revokeDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    return this.userDevicesService.revoke(user.id, deviceId);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Consultar notificaciones persistentes' })
  @ApiOkResponse({ type: NotificationListResponseDto })
  listNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ): Promise<NotificationListResponseDto> {
    return this.notificationsService.list(user.id, query);
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Consultar cantidad de notificaciones no leídas' })
  @ApiOkResponse({ type: NotificationUnreadCountResponseDto })
  async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationUnreadCountResponseDto> {
    return {
      unreadCount: await this.notificationsService.unreadCount(user.id),
    };
  }

  @Patch('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { affected: { type: 'integer', example: 4 } },
    },
  })
  async markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ affected: number }> {
    return {
      affected: await this.notificationsService.markAllRead(user.id),
    };
  }

  @Patch('notifications/:notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'La notificación no existe' })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<void> {
    return this.notificationsService.markRead(user.id, notificationId);
  }
}
