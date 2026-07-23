import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull, QueryFailedError } from 'typeorm';

import { NotificationListResponseDto } from './dto/notification-response.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UserNotification } from './entities/user-notification.entity';
import { NotificationDeliveryStatus } from './enums/notification-delivery-status.enum';
import { FcmPushService } from './fcm-push.service';
import type { CreateNotificationInput } from './interfaces/create-notification.interface';
import { UserDevicesService } from './user-devices.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userDevicesService: UserDevicesService,
    private readonly fcmPushService: FcmPushService,
  ) {}

  async createAndDeliver(
    input: CreateNotificationInput,
  ): Promise<UserNotification> {
    const notification = await this.findOrCreate(input);

    if (notification.deliveryStatus === NotificationDeliveryStatus.SENT) {
      return notification;
    }

    const devices = await this.userDevicesService.listActive(input.userId);
    if (devices.length === 0) {
      return notification;
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    const results = await Promise.all(
      devices.map(async (device) => ({
        device,
        result: await this.fcmPushService.send({
          token: device.pushToken,
          title: input.title,
          body: input.body,
          data: input.data,
        }),
      })),
    );

    for (const { device, result } of results) {
      if (result.kind === 'sent') {
        sent += 1;
      } else if (result.kind === 'skipped') {
        skipped += 1;
      } else {
        failed += 1;
        errors.push(result.error);
        if (result.invalidToken) {
          await this.userDevicesService.revokeById(device.id);
        }
      }
    }

    notification.deliveryAttempts += 1;
    notification.lastError = errors.length > 0 ? errors.join(' | ') : null;

    if (sent === devices.length) {
      notification.deliveryStatus = NotificationDeliveryStatus.SENT;
      notification.sentAt = new Date();
    } else if (sent > 0) {
      notification.deliveryStatus = NotificationDeliveryStatus.PARTIAL;
      notification.sentAt = new Date();
    } else if (failed > 0 && skipped === 0) {
      notification.deliveryStatus = NotificationDeliveryStatus.FAILED;
    } else {
      notification.deliveryStatus = NotificationDeliveryStatus.PENDING;
    }

    const savedNotification = await this.dataSource
      .getRepository(UserNotification)
      .save(notification);

    if (sent === 0 && failed > 0 && skipped === 0) {
      throw new Error(
        `No se pudo entregar la notificación ${savedNotification.id}: ${savedNotification.lastError ?? 'error desconocido'}`,
      );
    }

    return savedNotification;
  }

  async list(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<NotificationListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const repository = this.dataSource.getRepository(UserNotification);
    const where = query.unreadOnly ? { userId, readAt: IsNull() } : { userId };
    const [items, totalItems] = await repository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        data: item.data,
        deliveryStatus: item.deliveryStatus,
        sentAt: item.sentAt,
        readAt: item.readAt,
        createdAt: item.createdAt,
      })),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
      },
    };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const repository = this.dataSource.getRepository(UserNotification);
    const notification = await repository.findOne({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      throw new NotFoundException('La notificación no existe');
    }
    if (!notification.readAt) {
      notification.readAt = new Date();
      await repository.save(notification);
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.dataSource
      .getRepository(UserNotification)
      .update({ userId, readAt: IsNull() }, { readAt: new Date() });
    return result.affected ?? 0;
  }

  unreadCount(userId: string): Promise<number> {
    return this.dataSource.getRepository(UserNotification).count({
      where: { userId, readAt: IsNull() },
    });
  }

  private async findOrCreate(
    input: CreateNotificationInput,
  ): Promise<UserNotification> {
    const repository = this.dataSource.getRepository(UserNotification);
    const existing = await repository.findOne({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) return existing;

    try {
      return await repository.save(
        repository.create({
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: input.data,
          dedupeKey: input.dedupeKey,
          deliveryStatus: NotificationDeliveryStatus.PENDING,
          deliveryAttempts: 0,
          sentAt: null,
          readAt: null,
          lastError: null,
        }),
      );
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) throw error;
      const duplicate = await repository.findOne({
        where: { dedupeKey: input.dedupeKey },
      });
      if (!duplicate) throw error;
      return duplicate;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string } | undefined;
    return driverError?.code === '23505';
  }
}
