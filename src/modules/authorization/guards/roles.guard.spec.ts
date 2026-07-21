import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserRole } from '../../users/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;

  class TestController {}

  const handler = (): void => undefined;

  function createContext(userRoles?: UserRole[]): ExecutionContext {
    const request = userRoles
      ? {
          user: {
            roles: userRoles,
          },
        }
      : {};

    return {
      getClass: () => TestController,
      getHandler: () => handler,

      switchToHttp: () => ({
        getRequest: <T>(): T => request as T,

        getResponse: <T>(): T => undefined as T,

        getNext: <T>(): T => undefined as T,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());

    Reflect.deleteMetadata(ROLES_KEY, handler);

    Reflect.deleteMetadata(ROLES_KEY, TestController);
  });

  it('debe permitir rutas sin roles requeridos', () => {
    const result = guard.canActivate(createContext());

    expect(result).toBe(true);
  });

  it('debe permitir al usuario con el rol requerido', () => {
    Reflect.defineMetadata(ROLES_KEY, [UserRole.PASSENGER], handler);

    const result = guard.canActivate(createContext([UserRole.PASSENGER]));

    expect(result).toBe(true);
  });

  it('debe rechazar al usuario sin el rol requerido', () => {
    Reflect.defineMetadata(ROLES_KEY, [UserRole.DRIVER], handler);

    expect(() =>
      guard.canActivate(createContext([UserRole.PASSENGER])),
    ).toThrow(ForbiddenException);
  });

  it('debe rechazar cuando no existe usuario autenticado', () => {
    Reflect.defineMetadata(ROLES_KEY, [UserRole.PASSENGER], handler);

    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('debe permitir siempre a SUPER_ADMIN', () => {
    Reflect.defineMetadata(ROLES_KEY, [UserRole.DRIVER], handler);

    const result = guard.canActivate(createContext([UserRole.SUPER_ADMIN]));

    expect(result).toBe(true);
  });
});
