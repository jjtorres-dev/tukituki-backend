import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CreateGatewaySessionInput {
  transactionId: string;
  orderNumber: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  passengerUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
}

export interface GatewayCheckoutSession {
  provider: PaymentProvider;
  authorization: string;
  publicKey: string;
  checkoutScriptUrl: string;
  checkoutConfig: Record<string, unknown>;
  expiresAt: Date;
}

export interface PaymentGateway {
  createCheckoutSession(
    input: CreateGatewaySessionInput,
  ): Promise<GatewayCheckoutSession>;
}
