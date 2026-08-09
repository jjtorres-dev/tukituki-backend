import { ConfigService } from '@nestjs/config';

import {
  CommissionRuntimeMode,
  isCommissionEnforced,
} from './commission-runtime-mode';

describe('commission runtime mode', () => {
  it('debe desactivar comisiones en modo demo', () => {
    const configService = {
      get: jest.fn(() => CommissionRuntimeMode.DISABLED),
    } as unknown as ConfigService;

    expect(isCommissionEnforced(configService)).toBe(false);
  });

  it('debe activar comisiones solamente en ENFORCED', () => {
    const configService = {
      get: jest.fn(() => CommissionRuntimeMode.ENFORCED),
    } as unknown as ConfigService;

    expect(isCommissionEnforced(configService)).toBe(true);
  });

  it('debe permanecer desactivado si ConfigService no está disponible', () => {
    expect(isCommissionEnforced()).toBe(false);
  });
});
