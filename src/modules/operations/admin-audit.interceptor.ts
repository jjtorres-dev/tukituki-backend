import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { createHmac, randomUUID } from 'node:crypto';
import { catchError, concatMap, from, map, Observable, throwError } from 'rxjs';

import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditOutcome } from './enums/admin-audit-outcome.enum';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AuthenticatedAdminRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly hashSecret: string;

  constructor(
    private readonly auditService: AdminAuditService,
    configService: ConfigService,
  ) {
    this.hashSecret = configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedAdminRequest>();
    const response = http.getResponse<Response>();
    const method = request.method.toUpperCase();
    const path = request.originalUrl.split('?')[0] ?? request.path;
    const user = request.user;

    if (
      !MUTATING_METHODS.has(method) ||
      !path.split('/').includes('admin') ||
      !user ||
      !user.roles.some((role) =>
        [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(role),
      )
    ) {
      return next.handle();
    }

    return this.interceptAdminMutation(context, next, request, response, user);
  }

  private interceptAdminMutation(
    context: ExecutionContext,
    next: CallHandler,
    request: AuthenticatedAdminRequest,
    response: Response,
    user: AuthenticatedUser,
  ): Observable<unknown> {
    const requestId =
      this.headerValue(request.headers['x-request-id'])?.slice(0, 100) ??
      randomUUID();
    response.setHeader('x-request-id', requestId);

    const route = this.normalizedRoute(request.originalUrl);
    const { resourceType, resourceId } = this.resourceFromRoute(
      request.originalUrl,
    );
    const baseInput = {
      actorUserId: user.id,
      actorRoles: user.roles,
      action: `${request.method.toUpperCase()} ${route}`.slice(0, 180),
      resourceType,
      resourceId,
      httpMethod: request.method.toUpperCase(),
      route: route.slice(0, 300),
      requestId,
      ipHash: this.hashIp(request.ip || request.socket.remoteAddress),
      userAgent:
        this.headerValue(request.headers['user-agent'])?.slice(0, 500) ?? null,
    };

    return next.handle().pipe(
      concatMap((result: unknown) =>
        from(
          this.auditService.record({
            ...baseInput,
            outcome: AdminAuditOutcome.SUCCESS,
            responseStatusCode: response.statusCode,
            metadata: {
              controller: context.getClass().name,
              handler: context.getHandler().name,
            },
          }),
        ).pipe(map(() => result)),
      ),
      catchError((error: unknown) =>
        from(
          this.auditService.record({
            ...baseInput,
            outcome: AdminAuditOutcome.FAILURE,
            responseStatusCode:
              error instanceof HttpException ? error.getStatus() : 500,
            metadata: {
              controller: context.getClass().name,
              handler: context.getHandler().name,
              errorType: error instanceof Error ? error.name : 'UnknownError',
            },
          }),
        ).pipe(concatMap(() => throwError(() => error))),
      ),
    );
  }

  private normalizedRoute(originalUrl: string): string {
    const path = originalUrl.split('?')[0] ?? originalUrl;
    return path
      .split('/')
      .filter(Boolean)
      .map((segment) => (UUID_PATTERN.test(segment) ? ':id' : segment))
      .join('/');
  }

  private resourceFromRoute(originalUrl: string): {
    resourceType: string;
    resourceId: string | null;
  } {
    const segments = (originalUrl.split('?')[0] ?? originalUrl)
      .split('/')
      .filter(Boolean);
    const adminIndex = segments.indexOf('admin');
    const resourceSegments =
      adminIndex >= 0 ? segments.slice(adminIndex + 1) : [];
    return {
      resourceType: (resourceSegments[0] ?? 'admin').slice(0, 80),
      resourceId:
        resourceSegments
          .find((segment) => UUID_PATTERN.test(segment))
          ?.slice(0, 120) ?? null,
    };
  }

  private hashIp(ip: string | undefined): string | null {
    if (!ip) return null;
    return createHmac('sha256', this.hashSecret).update(ip).digest('hex');
  }

  private headerValue(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }
}
