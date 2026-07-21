import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

export class PublicUserDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    example: '+51987654321',
  })
  phoneE164!: string;

  @ApiProperty({
    enum: UserRole,
    isArray: true,
  })
  roles!: UserRole[];

  @ApiProperty({
    enum: UserStatus,
  })
  status!: UserStatus;

  @ApiProperty()
  isPhoneVerified!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;
}

export class RegisterResponseDto {
  @ApiProperty({
    type: PublicUserDto,
  })
  user!: PublicUserDto;
}
