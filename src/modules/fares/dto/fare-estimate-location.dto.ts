import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FareEstimateLocationDto {
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

  @ApiProperty({
    example: 'Jr. Lima 250, Tarapoto',
    minLength: 5,
    maxLength: 300,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address!: string;

  /*
   * Solo tiene efecto en `destination` (`FaresService` nunca la lee en
   * `origin`, que siempre se reverse-geocodea sin condición). true =
   * el pasajero eligió este punto tocando el mapa, nunca autocomplete
   * — así que `address` es un placeholder local de la app, no una
   * dirección real, y hay que resolverla por reverse geocoding.
   *
   * Reemplaza la comparación por texto contra un literal de copy de
   * UI (`MANUAL_DESTINATION_PLACEHOLDER` en fares.service.ts), que
   * quedaba desincronizada en silencio si la app cambiaba ese copy
   * sin tocar este repo. Se mantiene opcional únicamente para no
   * romper la única instalación anterior a este campo (un APK de
   * prueba en un celular físico, sin distribución pública) — ver el
   * fallback legado en `FaresService.estimate`.
   */
  @ApiPropertyOptional({
    default: false,
    description:
      'Solo aplica a `destination`. true = el pasajero eligió el punto tocando el mapa (nunca autocomplete): el backend debe resolver la dirección real por reverse geocoding en vez de confiar en `address`. Si se omite, el backend usa el fallback legado (compara `address` contra el placeholder histórico) para no romper clientes anteriores a este campo.',
  })
  @IsOptional()
  @IsBoolean()
  isManualSelection?: boolean;
}
