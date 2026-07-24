import { ApiProperty } from '@nestjs/swagger';

import { RideStatus } from '../../rides/enums/ride-status.enum';

export class OperationalPeriodResponseDto {
  @ApiProperty({ format: 'date-time' })
  dateFrom!: Date;

  @ApiProperty({ format: 'date-time' })
  dateTo!: Date;

  @ApiProperty({ nullable: true, format: 'uuid' })
  serviceZoneId!: string | null;

  @ApiProperty({ example: 'America/Lima' })
  timezone!: string;
}

export class RideOperationalSummaryDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  active!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  cancelled!: number;

  @ApiProperty()
  expired!: number;

  @ApiProperty({ description: 'Porcentaje entre 0 y 100.' })
  completionRate!: number;

  @ApiProperty({ description: 'Porcentaje entre 0 y 100.' })
  cancellationRate!: number;

  @ApiProperty()
  uniquePassengers!: number;

  @ApiProperty()
  uniqueDrivers!: number;
}

export class FinanceOperationalSummaryDto {
  @ApiProperty()
  grossFare!: string;

  @ApiProperty()
  averageFinalFare!: string;

  @ApiProperty()
  cancellationFeesCharged!: string;

  @ApiProperty()
  cancellationFeesWaived!: string;

  @ApiProperty({ example: 'PEN' })
  currency!: string;
}

export class TimingOperationalSummaryDto {
  @ApiProperty({ nullable: true })
  averageMatchingSeconds!: number | null;

  @ApiProperty({ nullable: true })
  averagePickupSeconds!: number | null;

  @ApiProperty({ nullable: true })
  averageRideSeconds!: number | null;
}

export class SafetyOperationalSummaryDto {
  @ApiProperty()
  incidents!: number;

  @ApiProperty()
  openIncidents!: number;
}

export class DriverStateOperationalSummaryDto {
  @ApiProperty()
  offline!: number;

  @ApiProperty()
  available!: number;

  @ApiProperty()
  busy!: number;
}

export class OperationalDashboardResponseDto {
  @ApiProperty({ type: OperationalPeriodResponseDto })
  period!: OperationalPeriodResponseDto;

  @ApiProperty({ type: RideOperationalSummaryDto })
  rides!: RideOperationalSummaryDto;

  @ApiProperty({ type: FinanceOperationalSummaryDto })
  finance!: FinanceOperationalSummaryDto;

  @ApiProperty({ type: TimingOperationalSummaryDto })
  timings!: TimingOperationalSummaryDto;

  @ApiProperty({ type: SafetyOperationalSummaryDto })
  safety!: SafetyOperationalSummaryDto;

  @ApiProperty({ type: DriverStateOperationalSummaryDto })
  driverStates!: DriverStateOperationalSummaryDto;
}

export class OperationalTimeSeriesItemDto {
  @ApiProperty({
    description: 'Inicio del intervalo en la zona horaria America/Lima.',
  })
  bucket!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  cancelled!: number;

  @ApiProperty()
  expired!: number;

  @ApiProperty()
  grossFare!: string;
}

export class OperationalTimeSeriesResponseDto {
  @ApiProperty({ type: OperationalPeriodResponseDto })
  period!: OperationalPeriodResponseDto;

  @ApiProperty({ type: OperationalTimeSeriesItemDto, isArray: true })
  items!: OperationalTimeSeriesItemDto[];
}

export class OperationalZoneItemDto {
  @ApiProperty({ format: 'uuid' })
  serviceZoneId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  cancelled!: number;

  @ApiProperty()
  completionRate!: number;

  @ApiProperty()
  grossFare!: string;

  @ApiProperty()
  averageFinalFare!: string;
}

export class OperationalZonesResponseDto {
  @ApiProperty({ type: OperationalPeriodResponseDto })
  period!: OperationalPeriodResponseDto;

  @ApiProperty({ type: OperationalZoneItemDto, isArray: true })
  items!: OperationalZoneItemDto[];
}

export class RideStatusMetricDto {
  @ApiProperty({ enum: RideStatus })
  status!: RideStatus;

  @ApiProperty()
  count!: number;
}
