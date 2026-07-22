import { IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ServiceZoneBoundaryDto {
  @ApiProperty({
    enum: ['Polygon'],
    example: 'Polygon',
  })
  @IsIn(['Polygon'])
  type!: 'Polygon';

  @ApiProperty({
    description:
      'Coordenadas GeoJSON en orden [longitud, latitud]. El primer y último punto de cada anillo deben coincidir.',
    example: [
      [
        [-76.39, -6.53],
        [-76.32, -6.53],
        [-76.32, -6.44],
        [-76.39, -6.44],
        [-76.39, -6.53],
      ],
    ],
  })
  @IsArray()
  coordinates!: number[][][];
}
