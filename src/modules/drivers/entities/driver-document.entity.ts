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
import { DriverDocumentStatus } from '../enums/driver-document-status.enum';
import { DriverDocumentType } from '../enums/driver-document-type.enum';
import { DriverProfile } from './driver-profile.entity';

@Entity({
  name: 'driver_documents',
})
@Index('UQ_driver_documents_profile_type', ['driverProfileId', 'type'], {
  unique: true,
})
@Index('IDX_driver_documents_driver_profile_id', ['driverProfileId'])
@Index('IDX_driver_documents_status', ['status'])
@Index('IDX_driver_documents_expires_at', ['expiresAt'])
@Index('IDX_driver_documents_reviewed_by_user_id', ['reviewedByUserId'])
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'driver_profile_id',
    type: 'uuid',
  })
  driverProfileId!: string;

  @ManyToOne(() => DriverProfile, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'driver_profile_id',
  })
  driverProfile!: Relation<DriverProfile>;

  @Column({
    type: 'enum',
    enum: DriverDocumentType,
    enumName: 'driver_document_type_enum',
  })
  type!: DriverDocumentType;

  /*
   * Legacy: URL arbitraria enviada por el cliente (sin subida real
   * validada por el Backend). Nullable desde STORAGE-R2: un
   * documento puede existir únicamente con fileObjectKey.
   */
  @Column({
    name: 'file_url',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  fileUrl!: string | null;

  /*
   * objectKey canónico en Railway Storage Buckets (STORAGE-R2),
   * validado mediante presigned upload + HeadObject antes de
   * persistirse. Es el mecanismo preferido; fileUrl queda como
   * fallback legacy temporal (ver modules/storage).
   */
  @Column({
    name: 'file_object_key',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  fileObjectKey!: string | null;

  @Column({
    name: 'document_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  documentNumber!: string | null;

  @Column({
    name: 'issued_at',
    type: 'date',
    nullable: true,
  })
  issuedAt!: string | null;

  @Column({
    name: 'expires_at',
    type: 'date',
    nullable: true,
  })
  expiresAt!: string | null;

  @Column({
    type: 'enum',
    enum: DriverDocumentStatus,
    enumName: 'driver_document_status_enum',
    default: DriverDocumentStatus.DRAFT,
  })
  status!: DriverDocumentStatus;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  rejectionReason!: string | null;

  @Column({
    name: 'reviewed_at',
    type: 'timestamptz',
    nullable: true,
  })
  reviewedAt!: Date | null;

  @Column({
    name: 'reviewed_by_user_id',
    type: 'uuid',
    nullable: true,
  })
  reviewedByUserId!: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'reviewed_by_user_id',
  })
  reviewedBy!: Relation<User> | null;

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
