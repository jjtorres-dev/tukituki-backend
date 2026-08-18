import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

interface UserWithAuthPolicyFields {
  status: UserStatus;
  roles: readonly UserRole[];
  isPhoneVerified: boolean;
}

function hasAdministrativeRole(user: UserWithAuthPolicyFields): boolean {
  return user.roles.some(
    (role) => role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN,
  );
}

// MVP: la verificación de teléfono por SMS está diferida solo para cuentas
// de consumidor (Passenger/Driver). Cualquier cuenta con rol administrativo
// (ADMIN/SUPER_ADMIN) — incluso combinado con otros roles — sigue exigiendo
// isPhoneVerified: la seguridad administrativa tiene precedencia.
export function isUserOperationallyEnabled(
  user: UserWithAuthPolicyFields,
): boolean {
  if (user.status !== UserStatus.ACTIVE) {
    return false;
  }

  if (hasAdministrativeRole(user)) {
    return user.isPhoneVerified;
  }

  return true;
}
