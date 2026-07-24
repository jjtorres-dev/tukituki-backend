import { BadRequestException } from '@nestjs/common';

const DEFAULT_PERIOD_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const MAX_PERIOD_MILLISECONDS = 366 * 24 * 60 * 60 * 1000;

export interface OperationalPeriod {
  dateFrom: Date;
  dateTo: Date;
}

export function resolveOperationalPeriod(
  dateFrom?: string,
  dateTo?: string,
  now = new Date(),
): OperationalPeriod {
  const resolvedTo = dateTo ? new Date(dateTo) : now;
  const resolvedFrom = dateFrom
    ? new Date(dateFrom)
    : new Date(resolvedTo.getTime() - DEFAULT_PERIOD_MILLISECONDS);

  if (
    !Number.isFinite(resolvedFrom.getTime()) ||
    !Number.isFinite(resolvedTo.getTime())
  ) {
    throw new BadRequestException('El rango de fechas no es válido');
  }
  if (resolvedFrom.getTime() >= resolvedTo.getTime()) {
    throw new BadRequestException(
      'dateFrom debe ser anterior y dateTo debe ser exclusivo',
    );
  }
  if (resolvedTo.getTime() - resolvedFrom.getTime() > MAX_PERIOD_MILLISECONDS) {
    throw new BadRequestException(
      'El rango máximo permitido para reportes es de 366 días',
    );
  }

  return { dateFrom: resolvedFrom, dateTo: resolvedTo };
}
