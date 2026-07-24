import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  OperationalMetricsQueryDto,
  OperationalTimeSeriesQueryDto,
  RideReportExportQueryDto,
} from './dto/operational-metrics-query.dto';
import {
  OperationalDashboardResponseDto,
  OperationalPeriodResponseDto,
  OperationalTimeSeriesResponseDto,
  OperationalZonesResponseDto,
} from './dto/operational-metrics-response.dto';
import { OperationalMetricInterval } from './enums/operational-metric-interval.enum';
import {
  OperationalPeriod,
  resolveOperationalPeriod,
} from './operational-period.util';

const REPORT_TIMEZONE = 'America/Lima';

interface RideMetricsRaw {
  total: string | number;
  active: string | number;
  completed: string | number;
  cancelled: string | number;
  expired: string | number;
  uniquePassengers: string | number;
  uniqueDrivers: string | number;
  grossFare: string | number;
  averageFinalFare: string | number | null;
  averageMatchingSeconds: string | number | null;
  averagePickupSeconds: string | number | null;
  averageRideSeconds: string | number | null;
}

interface CancellationMetricsRaw {
  charged: string | number;
  waived: string | number;
}

interface SafetyMetricsRaw {
  incidents: string | number;
  openIncidents: string | number;
}

interface DriverStateMetricsRaw {
  offline: string | number;
  available: string | number;
  busy: string | number;
}

interface TimeSeriesRaw {
  bucket: string;
  total: string | number;
  completed: string | number;
  cancelled: string | number;
  expired: string | number;
  grossFare: string | number;
}

interface ZoneMetricsRaw {
  serviceZoneId: string;
  code: string;
  name: string;
  total: string | number;
  completed: string | number;
  cancelled: string | number;
  grossFare: string | number;
  averageFinalFare: string | number | null;
}

interface RideReportRow {
  rideId: string;
  status: string;
  requestedAt: Date | string;
  driverAssignedAt: Date | string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  cancelledAt: Date | string | null;
  originZone: string;
  originAddress: string;
  destinationAddress: string;
  estimatedFare: string;
  finalFare: string | null;
  currency: string;
  actualDistanceMeters: number | null;
  actualDurationSeconds: number | null;
}

@Injectable()
export class OperationalMetricsService {
  constructor(private readonly dataSource: DataSource) {}

  async dashboard(
    query: OperationalMetricsQueryDto,
  ): Promise<OperationalDashboardResponseDto> {
    const period = resolveOperationalPeriod(query.dateFrom, query.dateTo);
    const parameters = [
      period.dateFrom,
      period.dateTo,
      query.serviceZoneId ?? null,
    ];

    const [rideRows, cancellationRows, safetyRows, driverStateRows] =
      await Promise.all([
        this.dataSource.query<RideMetricsRaw[]>(
          `SELECT
             COUNT(*) AS "total",
             COUNT(*) FILTER (WHERE r.status IN (
               'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING',
               'DRIVER_ARRIVED', 'IN_PROGRESS'
             )) AS "active",
             COUNT(*) FILTER (WHERE r.status = 'COMPLETED') AS "completed",
             COUNT(*) FILTER (WHERE r.status = 'CANCELLED') AS "cancelled",
             COUNT(*) FILTER (WHERE r.status = 'EXPIRED') AS "expired",
             COUNT(DISTINCT r.passenger_user_id) AS "uniquePassengers",
             COUNT(DISTINCT r.driver_profile_id)
               FILTER (WHERE r.driver_profile_id IS NOT NULL) AS "uniqueDrivers",
             COALESCE(SUM(r.final_fare)
               FILTER (WHERE r.status = 'COMPLETED'), 0) AS "grossFare",
             AVG(r.final_fare)
               FILTER (WHERE r.status = 'COMPLETED') AS "averageFinalFare",
             AVG(EXTRACT(EPOCH FROM
               (r.driver_assigned_at - r.requested_at)))
               FILTER (WHERE r.driver_assigned_at IS NOT NULL)
               AS "averageMatchingSeconds",
             AVG(EXTRACT(EPOCH FROM
               (r.driver_arrived_at - r.driver_assigned_at)))
               FILTER (
                 WHERE r.driver_arrived_at IS NOT NULL
                   AND r.driver_assigned_at IS NOT NULL
               ) AS "averagePickupSeconds",
             AVG(r.actual_duration_seconds)
               FILTER (WHERE r.status = 'COMPLETED')
               AS "averageRideSeconds"
           FROM rides r
           WHERE r.requested_at >= $1
             AND r.requested_at < $2
             AND ($3::uuid IS NULL OR r.origin_zone_id = $3)`,
          parameters,
        ),
        this.dataSource.query<CancellationMetricsRaw[]>(
          `SELECT
             COALESCE(SUM(rc.charged_fee), 0) AS "charged",
             COALESCE(SUM(rc.waived_amount), 0) AS "waived"
           FROM ride_cancellations rc
           INNER JOIN rides r ON r.id = rc.ride_id
           WHERE rc.created_at >= $1
             AND rc.created_at < $2
             AND ($3::uuid IS NULL OR r.origin_zone_id = $3)`,
          parameters,
        ),
        this.dataSource.query<SafetyMetricsRaw[]>(
          `SELECT
             COUNT(*) AS "incidents",
             COUNT(*) FILTER (
               WHERE incident.status IN ('OPEN', 'ACKNOWLEDGED', 'IN_REVIEW')
             ) AS "openIncidents"
           FROM ride_safety_incidents incident
           INNER JOIN rides r ON r.id = incident.ride_id
           WHERE incident.created_at >= $1
             AND incident.created_at < $2
             AND ($3::uuid IS NULL OR r.origin_zone_id = $3)`,
          parameters,
        ),
        this.dataSource.query<DriverStateMetricsRaw[]>(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'OFFLINE') AS "offline",
             COUNT(*) FILTER (WHERE status = 'AVAILABLE') AS "available",
             COUNT(*) FILTER (WHERE status = 'BUSY') AS "busy"
           FROM driver_operational_states`,
        ),
      ]);

    const rides = rideRows[0] ?? this.emptyRideMetrics();
    const cancellations = cancellationRows[0] ?? { charged: 0, waived: 0 };
    const safety = safetyRows[0] ?? { incidents: 0, openIncidents: 0 };
    const driverStates = driverStateRows[0] ?? {
      offline: 0,
      available: 0,
      busy: 0,
    };
    const total = this.number(rides.total);
    const completed = this.number(rides.completed);
    const cancelled = this.number(rides.cancelled);

    return {
      period: this.periodResponse(period, query.serviceZoneId),
      rides: {
        total,
        active: this.number(rides.active),
        completed,
        cancelled,
        expired: this.number(rides.expired),
        completionRate: this.percentage(completed, total),
        cancellationRate: this.percentage(cancelled, total),
        uniquePassengers: this.number(rides.uniquePassengers),
        uniqueDrivers: this.number(rides.uniqueDrivers),
      },
      finance: {
        grossFare: this.money(rides.grossFare),
        averageFinalFare: this.money(rides.averageFinalFare),
        cancellationFeesCharged: this.money(cancellations.charged),
        cancellationFeesWaived: this.money(cancellations.waived),
        currency: 'PEN',
      },
      timings: {
        averageMatchingSeconds: this.nullableNumber(
          rides.averageMatchingSeconds,
        ),
        averagePickupSeconds: this.nullableNumber(rides.averagePickupSeconds),
        averageRideSeconds: this.nullableNumber(rides.averageRideSeconds),
      },
      safety: {
        incidents: this.number(safety.incidents),
        openIncidents: this.number(safety.openIncidents),
      },
      driverStates: {
        offline: this.number(driverStates.offline),
        available: this.number(driverStates.available),
        busy: this.number(driverStates.busy),
      },
    };
  }

  async timeSeries(
    query: OperationalTimeSeriesQueryDto,
  ): Promise<OperationalTimeSeriesResponseDto> {
    const period = resolveOperationalPeriod(query.dateFrom, query.dateTo);
    this.assertHourlyRange(query.interval, period);
    const bucket = this.bucketExpression(query.interval);
    const rows = await this.dataSource.query<TimeSeriesRaw[]>(
      `SELECT
         ${bucket} AS "bucket",
         COUNT(*) AS "total",
         COUNT(*) FILTER (WHERE r.status = 'COMPLETED') AS "completed",
         COUNT(*) FILTER (WHERE r.status = 'CANCELLED') AS "cancelled",
         COUNT(*) FILTER (WHERE r.status = 'EXPIRED') AS "expired",
         COALESCE(SUM(r.final_fare)
           FILTER (WHERE r.status = 'COMPLETED'), 0) AS "grossFare"
       FROM rides r
       WHERE r.requested_at >= $1
         AND r.requested_at < $2
         AND ($3::uuid IS NULL OR r.origin_zone_id = $3)
       GROUP BY 1
       ORDER BY 1 ASC`,
      [period.dateFrom, period.dateTo, query.serviceZoneId ?? null],
    );

    return {
      period: this.periodResponse(period, query.serviceZoneId),
      items: rows.map((row) => ({
        bucket: row.bucket,
        total: this.number(row.total),
        completed: this.number(row.completed),
        cancelled: this.number(row.cancelled),
        expired: this.number(row.expired),
        grossFare: this.money(row.grossFare),
      })),
    };
  }

  async zones(
    query: OperationalMetricsQueryDto,
  ): Promise<OperationalZonesResponseDto> {
    const period = resolveOperationalPeriod(query.dateFrom, query.dateTo);
    const rows = await this.dataSource.query<ZoneMetricsRaw[]>(
      `SELECT
         zone.id AS "serviceZoneId",
         zone.code AS "code",
         zone.name AS "name",
         COUNT(*) AS "total",
         COUNT(*) FILTER (WHERE r.status = 'COMPLETED') AS "completed",
         COUNT(*) FILTER (WHERE r.status = 'CANCELLED') AS "cancelled",
         COALESCE(SUM(r.final_fare)
           FILTER (WHERE r.status = 'COMPLETED'), 0) AS "grossFare",
         AVG(r.final_fare)
           FILTER (WHERE r.status = 'COMPLETED') AS "averageFinalFare"
       FROM rides r
       INNER JOIN service_zones zone ON zone.id = r.origin_zone_id
       WHERE r.requested_at >= $1
         AND r.requested_at < $2
         AND ($3::uuid IS NULL OR r.origin_zone_id = $3)
       GROUP BY zone.id, zone.code, zone.name
       ORDER BY COUNT(*) DESC, zone.name ASC`,
      [period.dateFrom, period.dateTo, query.serviceZoneId ?? null],
    );

    return {
      period: this.periodResponse(period, query.serviceZoneId),
      items: rows.map((row) => {
        const total = this.number(row.total);
        const completed = this.number(row.completed);
        return {
          serviceZoneId: row.serviceZoneId,
          code: row.code,
          name: row.name,
          total,
          completed,
          cancelled: this.number(row.cancelled),
          completionRate: this.percentage(completed, total),
          grossFare: this.money(row.grossFare),
          averageFinalFare: this.money(row.averageFinalFare),
        };
      }),
    };
  }

  async exportRidesCsv(query: RideReportExportQueryDto): Promise<string> {
    const period = resolveOperationalPeriod(query.dateFrom, query.dateTo);
    const rows = await this.dataSource.query<RideReportRow[]>(
      `SELECT
         r.id AS "rideId",
         r.status AS "status",
         r.requested_at AS "requestedAt",
         r.driver_assigned_at AS "driverAssignedAt",
         r.started_at AS "startedAt",
         r.completed_at AS "completedAt",
         r.cancelled_at AS "cancelledAt",
         zone.name AS "originZone",
         r.origin_address AS "originAddress",
         r.destination_address AS "destinationAddress",
         r.estimated_fare AS "estimatedFare",
         r.final_fare AS "finalFare",
         r.currency AS "currency",
         r.actual_distance_meters AS "actualDistanceMeters",
         r.actual_duration_seconds AS "actualDurationSeconds"
       FROM rides r
       INNER JOIN service_zones zone ON zone.id = r.origin_zone_id
       WHERE r.requested_at >= $1
         AND r.requested_at < $2
         AND ($3::uuid IS NULL OR r.origin_zone_id = $3)
       ORDER BY r.requested_at DESC, r.id DESC
       LIMIT $4`,
      [
        period.dateFrom,
        period.dateTo,
        query.serviceZoneId ?? null,
        query.limit,
      ],
    );

    const header = [
      'ride_id',
      'status',
      'requested_at',
      'driver_assigned_at',
      'started_at',
      'completed_at',
      'cancelled_at',
      'origin_zone',
      'origin_address',
      'destination_address',
      'estimated_fare',
      'final_fare',
      'currency',
      'actual_distance_meters',
      'actual_duration_seconds',
    ];
    const lines = rows.map((row) =>
      [
        row.rideId,
        row.status,
        this.date(row.requestedAt),
        this.date(row.driverAssignedAt),
        this.date(row.startedAt),
        this.date(row.completedAt),
        this.date(row.cancelledAt),
        row.originZone,
        row.originAddress,
        row.destinationAddress,
        row.estimatedFare,
        row.finalFare,
        row.currency,
        row.actualDistanceMeters,
        row.actualDurationSeconds,
      ]
        .map((value) => this.csvCell(value))
        .join(','),
    );

    return `\uFEFF${[header.join(','), ...lines].join('\r\n')}\r\n`;
  }

  private periodResponse(
    period: OperationalPeriod,
    serviceZoneId?: string,
  ): OperationalPeriodResponseDto {
    return {
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      serviceZoneId: serviceZoneId ?? null,
      timezone: REPORT_TIMEZONE,
    };
  }

  private bucketExpression(interval: OperationalMetricInterval): string {
    const formats: Record<OperationalMetricInterval, string> = {
      [OperationalMetricInterval.HOUR]: `to_char(date_trunc('hour', r.requested_at AT TIME ZONE '${REPORT_TIMEZONE}'), 'YYYY-MM-DD"T"HH24:00:00')`,
      [OperationalMetricInterval.DAY]: `to_char(date_trunc('day', r.requested_at AT TIME ZONE '${REPORT_TIMEZONE}'), 'YYYY-MM-DD')`,
      [OperationalMetricInterval.WEEK]: `to_char(date_trunc('week', r.requested_at AT TIME ZONE '${REPORT_TIMEZONE}'), 'IYYY-"W"IW')`,
      [OperationalMetricInterval.MONTH]: `to_char(date_trunc('month', r.requested_at AT TIME ZONE '${REPORT_TIMEZONE}'), 'YYYY-MM')`,
    };
    return formats[interval];
  }

  private assertHourlyRange(
    interval: OperationalMetricInterval,
    period: OperationalPeriod,
  ): void {
    const days =
      (period.dateTo.getTime() - period.dateFrom.getTime()) / 86_400_000;
    if (interval === OperationalMetricInterval.HOUR && days > 31) {
      throw new BadRequestException(
        'El intervalo HOUR admite un rango máximo de 31 días',
      );
    }
  }

  private emptyRideMetrics(): RideMetricsRaw {
    return {
      total: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      expired: 0,
      uniquePassengers: 0,
      uniqueDrivers: 0,
      grossFare: 0,
      averageFinalFare: null,
      averageMatchingSeconds: null,
      averagePickupSeconds: null,
      averageRideSeconds: null,
    };
  }

  private number(value: string | number | null): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private nullableNumber(value: string | number | null): number | null {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
  }

  private money(value: string | number | null): string {
    return this.number(value).toFixed(2);
  }

  private percentage(part: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((part / total) * 10_000) / 100;
  }

  private date(value: Date | string | null): string {
    if (value === null) return '';
    return new Date(value).toISOString();
  }

  private csvCell(value: string | number | null): string {
    if (value === null) return '';
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }
}
