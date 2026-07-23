import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { DevicePlatform } from '../enums/device-platform.enum';

export class RegisterDeviceDto {
  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.ANDROID })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @ApiProperty({
    description: 'Token de registro entregado por Firebase Cloud Messaging',
    minLength: 20,
    maxLength: 500,
  })
  @IsString()
  @Length(20, 500)
  pushToken!: string;

  @ApiProperty({
    description: 'Identificador estable generado por la aplicación',
    minLength: 3,
    maxLength: 200,
  })
  @IsString()
  @Length(3, 200)
  deviceId!: string;

  @ApiPropertyOptional({ example: '1.0.0+1', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;
}
