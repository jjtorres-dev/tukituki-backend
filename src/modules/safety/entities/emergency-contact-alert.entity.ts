import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { EmergencyContactAlertStatus } from '../enums/emergency-contact-alert-status.enum';
import { EmergencyContact } from './emergency-contact.entity';
import { RideSafetyIncident } from './ride-safety-incident.entity';

@Entity({ name: 'emergency_contact_alerts' })
@Index(
  'UQ_emergency_contact_alerts_incident_contact',
  ['incidentId', 'contactId'],
  {
    unique: true,
  },
)
@Index('IDX_emergency_contact_alerts_status_created', ['status', 'createdAt'])
export class EmergencyContactAlert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId!: string;

  @ManyToOne(() => RideSafetyIncident, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident!: Relation<RideSafetyIncident>;

  @Column({ name: 'contact_id', type: 'uuid' })
  contactId!: string;

  @ManyToOne(() => EmergencyContact, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact!: Relation<EmergencyContact>;

  @Column({ name: 'contact_name', type: 'varchar', length: 120 })
  contactName!: string;

  @Column({ name: 'contact_phone_e164', type: 'varchar', length: 20 })
  contactPhoneE164!: string;

  @Column({ name: 'matched_user_id', type: 'uuid', nullable: true })
  matchedUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'matched_user_id' })
  matchedUser!: Relation<User> | null;

  @Column({
    type: 'enum',
    enum: EmergencyContactAlertStatus,
    enumName: 'emergency_contact_alert_status_enum',
  })
  status!: EmergencyContactAlertStatus;

  @Column({ name: 'delivery_attempts', type: 'integer', default: 0 })
  deliveryAttempts!: number;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
