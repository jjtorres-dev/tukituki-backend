import { ApiProperty } from '@nestjs/swagger';

import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';

export class DigitalCheckoutSessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ enum: PaymentProvider })
  provider!: PaymentProvider;

  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;

  @ApiProperty()
  transactionId!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ example: '8.50' })
  amount!: string;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({
    description: 'Token efímero que consume exclusivamente el SDK de Izipay.',
  })
  authorization!: string;

  @ApiProperty({ description: 'Llave pública RSA de Izipay.' })
  publicKey!: string;

  @ApiProperty({ format: 'uri' })
  checkoutScriptUrl!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  checkoutConfig!: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;
}
