import { OutboxEventType } from '../enums/outbox-event-type.enum';

export interface EnqueueOutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: OutboxEventType;
  payload?: Record<string, unknown>;
  availableAt?: Date;
}
