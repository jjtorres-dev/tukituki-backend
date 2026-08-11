import { UserRole } from '../enums/user-role.enum';

interface UserWithRoles {
  roles: readonly UserRole[];
}

export function isPassengerOnlyUser(user: UserWithRoles): boolean {
  return user.roles.length === 1 && user.roles[0] === UserRole.PASSENGER;
}
