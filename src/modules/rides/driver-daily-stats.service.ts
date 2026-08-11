import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  formatCents,
  parseScaledDecimal,
} from '../fares/utils/fixed-decimal.util';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { DriverDailyStatsResponseDto } from './dto/driver-daily-stats-response.dto';
import { resolveLocalDayWindow } from './utils/business-day.util';

/*
 * Moneda garantizada hoy por FareRule (default 'PEN').
 * No existe selector de moneda en el flujo de creación de
 * Ride, así que en la práctica todos los Rides comparten
 * esta moneda. Se usa como respuesta cuando no hay viajes
 * y como criterio para nunca sumar monedas distintas.
 */
const PLATFORM_CURRENCY = 'PEN';

interface DailyStatsRow {
  currency: string;
  completedRides: string | number;
  grossAmount: string | number;
}

@Injectable()
export class DriverDailyStatsService {
  private readonly logger = new Logger(DriverDailyStatsService.name);

  constructor(private readonly dataSource: DataSource) {}

  /*
   * "Ganado hoy" = SUM(finalFare) de Rides COMPLETED del
   * conductor con completedAt dentro del día de negocio
   * America/Lima. No depende de paymentStatus, comisión ni
   * neto de TukiTuki.
   *
   * "Viajes hoy" = COUNT de esos mismos Rides.
   *
   * `now` es inyectable para pruebas; en producción el
   * controller lo deja en el valor por defecto.
   */
  async getDailyStats(
    userId: string,
    now: Date = new Date(),
  ): Promise<DriverDailyStatsResponseDto> {
    const profile = await this.getApprovedProfile(userId);

    const window = resolveLocalDayWindow(now);

    /*
     * Agregación completa en DB: COUNT + SUM agrupados por
     * currency, ventana [startUtc, endUtc) parametrizada.
     * COALESCE cubre el caso legacy de un finalFare NULL
     * dentro de un grupo, sin ocultarlo (se documenta acá,
     * no se oculta cambiando entity/migration).
     */
    const rows = await this.dataSource.query<DailyStatsRow[]>(
      `SELECT
         r.currency AS "currency",
         COUNT(*) AS "completedRides",
         COALESCE(SUM(r.final_fare), 0) AS "grossAmount"
       FROM rides r
       WHERE r.driver_profile_id = $1
         AND r.status = 'COMPLETED'
         AND r.completed_at >= $2
         AND r.completed_at < $3
       GROUP BY r.currency`,
      [profile.id, window.startUtc, window.endUtc],
    );

    if (rows.length > 1) {
      /*
       * No sumamos monedas distintas silenciosamente.
       * Hoy esto no debería ocurrir (moneda única de
       * plataforma); si ocurriera, queda rastro para
       * investigar en vez de corromper el total.
       */
      this.logger.warn(
        `El conductor ${profile.id} tiene Rides COMPLETED en ` +
          `múltiples monedas el ${window.businessDate}: ` +
          rows.map((row) => row.currency).join(', '),
      );
    }

    const row =
      rows.find((candidate) => candidate.currency === PLATFORM_CURRENCY) ??
      rows[0] ??
      null;

    return {
      businessDate: window.businessDate,
      timezone: window.timezone,
      completedRides: row ? Number(row.completedRides) : 0,
      grossAmount: row
        ? formatCents(parseScaledDecimal(String(row.grossAmount), 2))
        : '0.00',
      currency: row?.currency ?? PLATFORM_CURRENCY,
      asOf: now,
    };
  }

  private async getApprovedProfile(userId: string): Promise<DriverProfile> {
    const profile = await this.dataSource.getRepository(DriverProfile).findOne({
      where: {
        userId,
      },
    });

    if (!profile) {
      throw new NotFoundException('El perfil de conductor no existe');
    }

    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado para operar');
    }

    return profile;
  }
}
