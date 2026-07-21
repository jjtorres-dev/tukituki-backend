import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { DriverStatus } from '../enums/driver-status.enum';
import { IdentityDocumentType } from '../enums/identity-document-type.enum';

@Entity({
  name: 'driver_profiles',
})
@Index('UQ_driver_profiles_user_id', ['userId'], {
  unique: true,
})
@Index('UQ_driver_profiles_document_number', ['documentNumber'], {
  unique: true,
})
@Index('IDX_driver_profiles_approved_by_user_id', ['approvedByUserId'])
@Index('IDX_driver_profiles_status', ['status'])
export class DriverProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'user_id',
    type: 'uuid',
  })
  userId!: string;

  @OneToOne(() => User, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: Relation<User>;

  @Column({
    name: 'first_name',
    type: 'varchar',
    length: 80,
  })
  firstName!: string;

  @Column({
    name: 'last_name',
    type: 'varchar',
    length: 80,
  })
  lastName!: string;

  @Column({
    name: 'document_type',
    type: 'enum',
    enum: IdentityDocumentType,
    enumName: 'identity_document_type_enum',
  })
  documentType!: IdentityDocumentType;

  @Column({
    name: 'document_number',
    type: 'varchar',
    length: 20,
  })
  documentNumber!: string;

  /*
   * PostgreSQL devuelve las columnas DATE como cadenas
   * con formato YYYY-MM-DD.
   */
  @Column({
    name: 'birth_date',
    type: 'date',
  })
  birthDate!: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  address!: string;

  @Column({
    name: 'photo_url',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  photoUrl!: string | null;

  @Column({
    type: 'enum',
    enum: DriverStatus,
    enumName: 'driver_status_enum',
    default: DriverStatus.DRAFT,
  })
  status!: DriverStatus;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  rejectionReason!: string | null;

  @Column({
    name: 'submitted_at',
    type: 'timestamptz',
    nullable: true,
  })
  submittedAt!: Date | null;

  @Column({
    name: 'approved_at',
    type: 'timestamptz',
    nullable: true,
  })
  approvedAt!: Date | null;

  @Column({
    name: 'approved_by_user_id',
    type: 'uuid',
    nullable: true,
  })
  approvedByUserId!: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'approved_by_user_id',
  })
  approvedBy!: Relation<User> | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;
}
