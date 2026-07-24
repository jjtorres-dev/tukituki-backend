import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { PromotionDiscountType } from './enums/promotion-discount-type.enum';
import { PromotionStatus } from './enums/promotion-status.enum';
import { PromotionsService } from './promotions.service';

type DiscountCalculator = {
  discount(
    type: PromotionDiscountType,
    bps: number | null,
    fixed: string | null,
    maximum: string | null,
    fare: string,
  ): bigint;
  normalizedValues(input: {
    code: string;
    name: string;
    discountType: PromotionDiscountType;
    discountBps?: number;
    fixedAmount?: string;
    startsAt: string;
    endsAt: string;
  }): { code: string; fixedAmount: string | null; status: PromotionStatus };
};

describe('PromotionsService', () => {
  const service = new PromotionsService({} as DataSource);
  const calculator = service as unknown as DiscountCalculator;

  it('calcula porcentajes en centimos con redondeo y tope', () => {
    expect(
      calculator.discount(
        PromotionDiscountType.PERCENTAGE,
        2500,
        null,
        '7.00',
        '40.00',
      ),
    ).toBe(700n);
  });

  it('calcula descuentos fijos sin superar la tarifa', () => {
    expect(
      calculator.discount(
        PromotionDiscountType.FIXED_AMOUNT,
        null,
        '20.00',
        null,
        '12.50',
      ),
    ).toBe(1250n);
  });

  it('normaliza codigos y montos antes de persistir', () => {
    const values = calculator.normalizedValues({
      code: ' bienvenida20 ',
      name: 'Bienvenida',
      discountType: PromotionDiscountType.FIXED_AMOUNT,
      fixedAmount: '5',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-08-01T00:00:00.000Z',
    });

    expect(values.code).toBe('BIENVENIDA20');
    expect(values.fixedAmount).toBe('5.00');
    expect(values.status).toBe(PromotionStatus.PAUSED);
  });

  it('rechaza periodos promocionales invertidos', () => {
    expect(() =>
      calculator.normalizedValues({
        code: 'INVALIDO',
        name: 'Invalido',
        discountType: PromotionDiscountType.PERCENTAGE,
        discountBps: 1000,
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });
});
