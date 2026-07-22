import type { TransformFnParams } from 'class-transformer';

export const MONEY_TWO_DECIMALS_PATTERN = /^(0|[1-9]\d{0,7})(\.\d{1,2})?$/;

export const RATE_FOUR_DECIMALS_PATTERN = /^(0|[1-9]\d{0,5})(\.\d{1,4})?$/;

export const MULTIPLIER_THREE_DECIMALS_PATTERN =
  /^(0|[1-9]\d{0,2})(\.\d{1,3})?$/;

export function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
