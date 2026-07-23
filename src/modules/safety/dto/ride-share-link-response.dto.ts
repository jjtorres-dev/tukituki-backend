import { ApiProperty } from '@nestjs/swagger';

import { RideShareLinkStatus } from '../enums/ride-share-link-status.enum';

export class RideShareLinkResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideShareLinkStatus })
  status!: RideShareLinkStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Solo se devuelve al crear el enlace',
  })
  shareUrl!: string | null;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  revokedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  lastAccessedAt!: Date | null;

  @ApiProperty()
  accessCount!: number;

  @ApiProperty()
  createdAt!: Date;
}
