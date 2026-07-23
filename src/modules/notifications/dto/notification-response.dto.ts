import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationDeliveryStatus } from '../enums/notification-delivery-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

export class NotificationItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  data!: Record<string, string>;

  @ApiProperty({ enum: NotificationDeliveryStatus })
  deliveryStatus!: NotificationDeliveryStatus;

  @ApiPropertyOptional({ nullable: true })
  sentAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  readAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class NotificationPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: NotificationItemResponseDto, isArray: true })
  items!: NotificationItemResponseDto[];

  @ApiProperty({ type: NotificationPaginationDto })
  pagination!: NotificationPaginationDto;
}

export class NotificationUnreadCountResponseDto {
  @ApiProperty()
  unreadCount!: number;
}
