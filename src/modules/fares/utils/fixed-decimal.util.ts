import { BadRequestException } from '@nestjs/common';

export function parseScaledDecimal(value: string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0) {
    throw new Error('La escala decimal no es válida');
  }

  const pattern = new RegExp(`^(0|[1-9]\\d*)(?:\\.(\\d{1,${scale}}))?$`);

  const match = pattern.exec(value);

  if (!match) {
    throw new BadRequestException(`El valor decimal ${value} no es válido`);
  }

  const wholePart = match[1];
  const fractionPart = match[2] ?? '';
  const normalizedFraction = fractionPart.padEnd(scale, '0');
  const base = 10n ** BigInt(scale);

  return BigInt(wholePart) * base + BigInt(normalizedFraction || '0');
}

export function divideRoundHalfUp(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= 0n) {
    throw new Error('El divisor debe ser mayor que cero');
  }

  if (numerator < 0n) {
    throw new Error('Esta utilidad solo admite importes no negativos');
  }

  return (numerator + denominator / 2n) / denominator;
}

export function calculateDistanceAmountCents(
  pricePerKm: string,
  distanceMeters: number,
): bigint {
  const rateScaledFour = parseScaledDecimal(pricePerKm, 4);

  return divideRoundHalfUp(rateScaledFour * BigInt(distanceMeters), 100000n);
}

export function calculateTimeAmountCents(
  pricePerMinute: string,
  durationSeconds: number,
): bigint {
  const rateScaledFour = parseScaledDecimal(pricePerMinute, 4);

  return divideRoundHalfUp(rateScaledFour * BigInt(durationSeconds), 6000n);
}

export function combineMultipliersScaledThree(multipliers: string[]): bigint {
  let combined = 1000n;

  for (const multiplier of multipliers) {
    combined = divideRoundHalfUp(
      combined * parseScaledDecimal(multiplier, 3),
      1000n,
    );
  }

  return combined;
}

export function applyMultiplierToCents(
  amountCents: bigint,
  multiplierScaledThree: bigint,
): bigint {
  return divideRoundHalfUp(amountCents * multiplierScaledThree, 1000n);
}

export function formatScaledInteger(value: bigint, scale: number): string {
  const base = 10n ** BigInt(scale);
  const wholePart = value / base;
  const fractionPart = (value % base).toString().padStart(scale, '0');

  return scale === 0 ? wholePart.toString() : `${wholePart}.${fractionPart}`;
}

export function formatCents(value: bigint): string {
  return formatScaledInteger(value, 2);
}
