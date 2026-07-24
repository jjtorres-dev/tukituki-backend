import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { IzipayPaymentGateway } from './izipay-payment.gateway';
import type { CreateGatewaySessionInput } from './payment-gateway.interface';

const input: CreateGatewaySessionInput = {
  transactionId: 'transaction1234567890',
  orderNumber: 'TTORDER123',
  amount: '8.50',
  currency: 'PEN',
  method: PaymentMethod.YAPE,
  passengerUserId: '2bb75614-f6d6-437f-b38f-e21aad622428',
  firstName: 'Juan',
  lastName: 'Pérez',
  email: 'juan@example.com',
  phoneNumber: '+51987654321',
};

function config(enabled: boolean): ConfigService {
  const values: Record<string, unknown> = {
    IZIPAY_ENABLED: enabled,
    IZIPAY_MERCHANT_CODE: '4004345',
    IZIPAY_API_KEY: 'sandbox-api-key',
    IZIPAY_PUBLIC_KEY:
      '-----BEGIN PUBLIC KEY-----sandbox-----END PUBLIC KEY-----',
    IZIPAY_TOKEN_SESSION_URL:
      'https://sandbox-api-pw.izipay.pe/security/v1/Token/Generate',
    IZIPAY_API_KEY_HEADER: 'X-Api-Key',
    IZIPAY_CHECKOUT_SCRIPT_URL:
      'https://sandbox-checkout.izipay.pe/payments/v1/js/index.js',
    PUBLIC_API_ORIGIN: 'https://api.tukituki.pe/',
    API_PREFIX: '/api/v2/',
    IZIPAY_SESSION_TTL_SECONDS: 900,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
}

describe('IzipayPaymentGateway', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no permite crear sesiones cuando Izipay está deshabilitado', async () => {
    const gateway = new IzipayPaymentGateway(config(false));

    await expect(gateway.createCheckoutSession(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('crea una sesión backend y devuelve solo datos públicos al cliente', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 't'.repeat(40) }), {
        status: 200,
      }),
    );
    const gateway = new IzipayPaymentGateway(config(true));

    const result = await gateway.createCheckoutSession(input);

    expect(result.provider).toBe(PaymentProvider.IZIPAY);
    expect(result.authorization).toBe('t'.repeat(40));
    expect(result.checkoutConfig.urlIPN).toBe(
      'https://api.tukituki.pe/api/v2/payments/webhooks/izipay',
    );
    expect(result.checkoutConfig['order']).toMatchObject({
      payMethod: 'YAPE_CODE',
    });
    expect(result.checkoutConfig).not.toHaveProperty('apiKey');
    expect(result.checkoutConfig).not.toHaveProperty('keyHash');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe(
      'https://sandbox-api-pw.izipay.pe/security/v1/Token/Generate',
    );
    expect(request?.[1]?.headers).toMatchObject({
      'Content-Type': 'application/json',
      transactionId: input.transactionId,
      'X-Api-Key': 'sandbox-api-key',
    });
  });

  it('configura PAGO_PUSH cuando el pasajero eligió Plin Interbank', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 'p'.repeat(40) }), {
        status: 200,
      }),
    );
    const gateway = new IzipayPaymentGateway(config(true));

    const result = await gateway.createCheckoutSession({
      ...input,
      method: PaymentMethod.PLIN,
    });

    expect(result.checkoutConfig['order']).toMatchObject({
      payMethod: 'PAGO_PUSH',
    });
  });

  it('convierte una respuesta inválida de Izipay en error de pasarela', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const gateway = new IzipayPaymentGateway(config(true));

    await expect(gateway.createCheckoutSession(input)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
