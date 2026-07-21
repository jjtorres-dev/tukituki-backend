import { ApiProperty } from '@nestjs/swagger';

export class AuthSessionResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    nullable: true,
    example: '127.0.0.1',
  })
  ipAddress!: string | null;

  @ApiProperty({
    nullable: true,
    example: 'Mozilla/5.0...',
  })
  userAgent!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  lastUsedAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  expiresAt!: Date;

  @ApiProperty({
    description: 'Indica si corresponde al access token actual',
  })
  isCurrent!: boolean;
}

export class LogoutAllResponseDto {
  @ApiProperty({
    example: 3,
  })
  revokedSessions!: number;
}
