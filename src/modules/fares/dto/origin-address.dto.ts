import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OriginAddressQueryDto {
  @ApiProperty({
    example: -6.4877,
  })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({
    example: -76.3599,
  })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;
}

export class OriginAddressResponseDto {
  @ApiProperty({
    example: 'Calle Rioja 495, Tarapoto',
    description:
      'Dirección real resuelta por reverse geocoding, o el fallback honesto de FaresService si Google no responde. Nunca vacía.',
  })
  address!: string;
}
