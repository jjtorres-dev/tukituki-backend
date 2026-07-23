import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DevicePlatform } from '../enums/device-platform.enum';

export class DeviceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DevicePlatform })
  platform!: DevicePlatform;

  @ApiProperty()
  deviceId!: string;

  @ApiPropertyOptional({ nullable: true })
  appVersion!: string | null;

  @ApiProperty()
  lastSeenAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  revokedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
