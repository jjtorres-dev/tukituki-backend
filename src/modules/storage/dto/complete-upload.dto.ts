import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

import { StorageCategory } from '../enums/storage-category.enum';

export class CompleteUploadDto {
  @ApiProperty({
    enum: StorageCategory,
    example: StorageCategory.DRIVER_LICENSE,
  })
  @IsEnum(StorageCategory)
  category!: StorageCategory;

  @ApiProperty({
    example:
      'drivers/72b81eb5-c53f-4de2-bd9f-11f33d64da64/documents/driver-license/9c3f9b3e-....jpg',
    description: 'objectKey devuelto previamente por /storage/uploads/presign',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  objectKey!: string;
}
