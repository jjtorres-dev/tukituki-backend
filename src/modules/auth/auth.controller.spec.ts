import type { Request } from 'express';

import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { OtpService } from './otp.service';
import type { AuthSessionsService } from '../auth-sessions/auth-sessions.service';

/*
 * OTP-R2: cobertura acotada al contrato de POST /auth/otp/request y
 * POST /auth/otp/verify (delegación al servicio correcto con los
 * argumentos correctos, incluida la IP para los límites dedicados).
 * No repite lo que ya cubre `otp.service.spec.ts`.
 */
describe('AuthController — OTP', () => {
  function buildController() {
    const authService = {} as AuthService;
    const otpService = {
      requestPhoneVerification: jest.fn(),
      verifyPhone: jest.fn(),
    };
    const authSessionsService = {} as AuthSessionsService;

    const controller = new AuthController(
      authService,
      otpService as unknown as OtpService,
      authSessionsService,
    );

    return { controller, otpService };
  }

  function buildRequest(ip: string | undefined): Request {
    return { ip } as Request;
  }

  it('POST /auth/otp/request delega en OtpService con el teléfono y la IP del request', async () => {
    const { controller, otpService } = buildController();
    otpService.requestPhoneVerification.mockResolvedValue({ expiresIn: 300 });

    const result = controller.requestPhoneOtp(
      { phoneE164: '+51987654321' },
      buildRequest('203.0.113.10'),
    );

    expect(otpService.requestPhoneVerification).toHaveBeenCalledWith(
      '+51987654321',
      '203.0.113.10',
    );
    await expect(result).resolves.toEqual({ expiresIn: 300 });
  });

  it('POST /auth/otp/request pasa null si el request no trae IP', async () => {
    const { controller, otpService } = buildController();
    otpService.requestPhoneVerification.mockResolvedValue({ expiresIn: 300 });

    await controller.requestPhoneOtp(
      { phoneE164: '+51987654321' },
      buildRequest(undefined),
    );

    expect(otpService.requestPhoneVerification).toHaveBeenCalledWith(
      '+51987654321',
      null,
    );
  });

  it('POST /auth/otp/verify delega en OtpService con el teléfono y el código', async () => {
    const { controller, otpService } = buildController();
    otpService.verifyPhone.mockResolvedValue({
      user: { id: 'user-1', isPhoneVerified: true },
    });

    const result = controller.verifyPhoneOtp({
      phoneE164: '+51987654321',
      code: '482913',
    });

    expect(otpService.verifyPhone).toHaveBeenCalledWith(
      '+51987654321',
      '482913',
    );
    await expect(result).resolves.toEqual({
      user: { id: 'user-1', isPhoneVerified: true },
    });
  });

  it('propaga los rechazos de OtpService (errores/rate limit) sin transformarlos', async () => {
    const { controller, otpService } = buildController();
    const rateLimitError = new Error('429');
    otpService.requestPhoneVerification.mockRejectedValue(rateLimitError);

    await expect(
      controller.requestPhoneOtp(
        { phoneE164: '+51987654321' },
        buildRequest('203.0.113.10'),
      ),
    ).rejects.toBe(rateLimitError);
  });
});
