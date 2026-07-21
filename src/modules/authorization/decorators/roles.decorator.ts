import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../../users/enums/user-role.enum';

export const ROLES_KEY = 'authorization:roles';

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
