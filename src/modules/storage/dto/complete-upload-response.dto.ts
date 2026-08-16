import { ApiProperty } from '@nestjs/swagger';

import { StorageCategory } from '../enums/storage-category.enum';

export class CompleteUploadResponseDto {
  @ApiProperty({
    enum: StorageCategory,
  })
  category!: StorageCategory;

  @ApiProperty()
  objectKey!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  completedAt!: string;
}
