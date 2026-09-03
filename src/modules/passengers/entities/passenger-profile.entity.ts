import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { User } from '../../users/entities/user.entity';

@Entity({
  name: 'passenger_profiles',
})
export class PassengerProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'user_id',
    type: 'uuid',
    unique: true,
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
    name: 'email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  email!: string | null;

  @Column({
    name: 'photo_url',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  photoUrl!: string | null;

  /*
   * objectKey canónico en Railway Storage Buckets (STORAGE-R2).
   * Cuando está presente, photoUrl es la URL estable del Backend
   * que redirige a una presigned GET fresca (ver
   * modules/storage/avatar-url.util.ts). Nullable: perfiles creados
   * antes de STORAGE-R2 solo tienen photoUrl legacy.
   */
  @Column({
    name: 'photo_object_key',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  photoObjectKey!: string | null;

  @Column({
    name: 'emergency_contact_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  emergencyContactName!: string | null;

  @Column({
    name: 'emergency_contact_phone_e164',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  emergencyContactPhoneE164!: string | null;

  @Column({
    name: 'rating_average',
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: '0.00',
  })
  ratingAverage!: string;

  @Column({
    name: 'rating_count',
    type: 'integer',
    default: 0,
  })
  ratingCount!: number;

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
