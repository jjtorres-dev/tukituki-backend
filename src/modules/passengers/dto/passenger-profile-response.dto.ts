import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PassengerProfileResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  userId!: string;

  @ApiProperty({
    example: 'Juan José',
  })
  firstName!: string;

  @ApiProperty({
    example: 'Torres Solano',
  })
  lastName!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  email!: string | null;

  @ApiProperty({
    example: '+51987654321',
  })
  phoneE164!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  photoUrl!: string | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  emergencyContactName!: string | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  emergencyContactPhoneE164!: string | null;

  @ApiProperty({ example: '4.85' })
  ratingAverage!: string;

  @ApiProperty()
  ratingCount!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  updatedAt!: Date;
}
