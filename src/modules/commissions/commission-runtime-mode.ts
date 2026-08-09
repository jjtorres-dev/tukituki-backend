import type { ConfigService } from '@nestjs/config';

export enum CommissionRuntimeMode {
  DISABLED = 'DISABLED',
  ENFORCED = 'ENFORCED',
}

/*
 * Seguridad financiera:
 *
 * La comisión solamente puede activarse
 * cuando la configuración dice explícitamente
 * ENFORCED.
 *
 * Si ConfigService falta o la variable no existe,
 * el resultado seguro es DISABLED.
 */
export function isCommissionEnforced(configService?: ConfigService): boolean {
  return (
    configService?.get<string>('COMMISSION_MODE') ===
    CommissionRuntimeMode.ENFORCED
  );
}
