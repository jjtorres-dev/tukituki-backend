import { ApiProperty } from '@nestjs/swagger';

/*
 * Respuesta de GET /drivers/me/stats/daily.
 *
 * "Ganado hoy" = tarifa bruta (finalFare) de Rides
 * COMPLETED del conductor, sin importar paymentStatus,
 * comisión ni monto neto.
 */
export class DriverDailyStatsResponseDto {
  @ApiProperty({
    example: '2026-08-10',
    description: 'Fecha local usada para la consulta (YYYY-MM-DD)',
  })
  businessDate!: string;

  @ApiProperty({
    example: 'America/Lima',
  })
  timezone!: string;

  @ApiProperty({
    example: 3,
    description: 'Cantidad de Rides COMPLETED dentro del día de negocio',
  })
  completedRides!: number;

  @ApiProperty({
    example: '18.50',
    description: 'Suma de finalFare de los Rides COMPLETED del día',
  })
  grossAmount!: string;

  @ApiProperty({
    example: 'PEN',
  })
  currency!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Momento UTC en que se calcularon las estadísticas',
  })
  asOf!: Date;
}
