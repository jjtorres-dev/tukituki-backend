import { ApiProperty } from '@nestjs/swagger';

import { DriverDocumentResponseDto } from '../../drivers/dto/driver-document-response.dto';
import { DriverProfileResponseDto } from '../../drivers/dto/driver-profile-response.dto';
import { DriverVehicleResponseDto } from '../../drivers/dto/driver-vehicle-response.dto';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

export class AdminDriverUserResponseDto {
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

export class AdminDriverDetailResponseDto {
  @ApiProperty({
    type: AdminDriverUserResponseDto,
  })
  user!: AdminDriverUserResponseDto;

  @ApiProperty({
    type: DriverProfileResponseDto,
  })
  profile!: DriverProfileResponseDto;

  @ApiProperty({
    type: DriverVehicleResponseDto,
    nullable: true,
  })
  vehicle!: DriverVehicleResponseDto | null;

  @ApiProperty({
    type: DriverDocumentResponseDto,
    isArray: true,
  })
  documents!: DriverDocumentResponseDto[];
}
