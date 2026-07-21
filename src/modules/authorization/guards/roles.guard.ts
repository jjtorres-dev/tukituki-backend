import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserRole } from '../../users/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface RequestUserWithRoles {
  roles: UserRole[];
}

interface RequestWithUser {
  user?: RequestUserWithRoles;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    /*
     * Si la ruta no declara @Roles(), este guard
     * no impone ninguna restricción adicional.
     */
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const userRoles = request.user?.roles;

    if (!userRoles) {
      throw new UnauthorizedException(
        'Debes iniciar sesión para acceder a este recurso',
      );
    }

    /*
     * SUPER_ADMIN puede acceder a cualquier ruta
     * protegida mediante roles.
     */
    if (userRoles.includes(UserRole.SUPER_ADMIN)) {
      return true;
    }

    const hasRequiredRole = requiredRoles.some((requiredRole) =>
      userRoles.includes(requiredRole),
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción',
      );
    }

    return true;
  }
}
