import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';
import type {
  CreateGatewaySessionInput,
  GatewayCheckoutSession,
  PaymentGateway,
} from './payment-gateway.interface';

interface IzipayTokenResponse {
  token?: unknown;
  authorization?: unknown;
  response?: {
    token?: unknown;
  };
}

@Injectable()
export class IzipayPaymentGateway implements PaymentGateway {
  constructor(private readonly configService: ConfigService) {}

  async createCheckoutSession(
    input: CreateGatewaySessionInput,
  ): Promise<GatewayCheckoutSession> {
    if (!this.configService.get<boolean>('IZIPAY_ENABLED', false)) {
      throw new ServiceUnavailableException(
        'Izipay todavía no está habilitado en este ambiente',
      );
    }

    const merchantCode = this.configService.getOrThrow<string>(
      'IZIPAY_MERCHANT_CODE',
    );
    const apiKey = this.configService.getOrThrow<string>('IZIPAY_API_KEY');
    const publicKey =
      this.configService.getOrThrow<string>('IZIPAY_PUBLIC_KEY');
    const tokenSessionUrl = this.configService.getOrThrow<string>(
      'IZIPAY_TOKEN_SESSION_URL',
    );
    const apiKeyHeader = this.configService.get<string>(
      'IZIPAY_API_KEY_HEADER',
      'X-Api-Key',
    );
    const checkoutScriptUrl = this.configService.getOrThrow<string>(
      'IZIPAY_CHECKOUT_SCRIPT_URL',
    );
    const publicApiOrigin =
      this.configService.getOrThrow<string>('PUBLIC_API_ORIGIN');
    const apiPrefix = this.configService
      .get<string>('API_PREFIX', 'api/v1')
      .replace(/^\/+|\/+$/g, '');
    const ttlSeconds = this.configService.get<number>(
      'IZIPAY_SESSION_TTL_SECONDS',
      900,
    );

    const checkoutConfig: Record<string, unknown> = {
      transactionId: input.transactionId,
      action: 'pay',
      merchantCode,
      order: {
        orderNumber: input.orderNumber,
        currency: input.currency,
        amount: input.amount,
        processType: 'AT',
        merchantBuyerId: input.passengerUserId,
        dateTimeTransaction: this.izipayDateTime(new Date()),
        payMethod: this.izipayPaymentMethod(input.method),
      },
      billing: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phoneNumber: input.phoneNumber.replace(/^\+51/, ''),
        country: 'PE',
      },
      urlIPN: `${publicApiOrigin.replace(/\/$/, '')}/${apiPrefix}/payments/webhooks/izipay`,
    };

    let response: Response;
    try {
      response = await fetch(tokenSessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          transactionId: input.transactionId,
          [apiKeyHeader]: apiKey,
        },
        body: JSON.stringify(checkoutConfig),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BadGatewayException(
        'No fue posible conectar con Izipay para crear la sesión',
      );
    }

    const rawBody = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(
        `Izipay rechazó la creación de sesión (${response.status})`,
      );
    }
    const authorization = this.extractAuthorization(rawBody);
    if (!authorization) {
      throw new BadGatewayException(
        'Izipay respondió sin un token de sesión válido',
      );
    }

    return {
      provider: PaymentProvider.IZIPAY,
      authorization,
      publicKey,
      checkoutScriptUrl,
      checkoutConfig,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  private extractAuthorization(rawBody: string): string | null {
    const trimmed = rawBody.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith('{')) return trimmed;
    try {
      const parsed = JSON.parse(trimmed) as IzipayTokenResponse;
      const candidates = [
        parsed.authorization,
        parsed.token,
        parsed.response?.token,
      ];
      const token = candidates.find(
        (candidate): candidate is string =>
          typeof candidate === 'string' && candidate.length > 20,
      );
      return token ?? null;
    } catch {
      return null;
    }
  }

  private izipayPaymentMethod(method: PaymentMethod): string {
    switch (method) {
      case PaymentMethod.YAPE:
        return 'YAPE_CODE';
      case PaymentMethod.PLIN:
        return 'PAGO_PUSH';
      case PaymentMethod.CARD:
        return 'CARD';
      default:
        throw new BadGatewayException('Método digital no soportado por Izipay');
    }
  }

  private izipayDateTime(date: Date): string {
    const components = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
      String(date.getUTCHours()).padStart(2, '0'),
      String(date.getUTCMinutes()).padStart(2, '0'),
      String(date.getUTCSeconds()).padStart(2, '0'),
    ];
    return components.join('');
  }
}
