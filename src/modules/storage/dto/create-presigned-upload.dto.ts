import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Matches, Max, Min } from 'class-validator';

import { StorageCategory } from '../enums/storage-category.enum';

const MIME_TYPE_PATTERN = /^[a-z0-9]+\/[a-z0-9.+-]+$/;

export class CreatePresignedUploadDto {
  @ApiProperty({
    enum: StorageCategory,
    example: StorageCategory.DRIVER_LICENSE,
  })
  @IsEnum(StorageCategory)
  category!: StorageCategory;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'MIME type real del archivo a subir',
  })
  @IsString()
  @Matches(MIME_TYPE_PATTERN, {
    message: 'El content type no tiene un formato MIME válido',
  })
  contentType!: string;

  @ApiProperty({
    example: 2_500_000,
    description: 'Tamaño exacto del archivo en bytes',
  })
  @IsInt()
  @Min(1)
  @Max(52_428_800)
  fileSize!: number;
}
