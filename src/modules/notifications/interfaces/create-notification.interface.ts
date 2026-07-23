import { NotificationType } from '../enums/notification-type.enum';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string>;
  dedupeKey: string;
}
