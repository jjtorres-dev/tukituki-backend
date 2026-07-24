import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { lastValueFrom, of, throwError } from 'rxjs';

import { UserRole } from '../users/enums/user-role.enum';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import {
  AdminAuditService,
  type CreateAdminAuditLogInput,
} from './admin-audit.service';
import { AdminAuditOutcome } from './enums/admin-audit-outcome.enum';

describe('AdminAuditInterceptor', () => {
  const user = {
    id: 'b44fd6c9-d874-4ab1-bfea-d7ab68723059',
    sessionId: 'cd31e6ac-c195-4a87-8040-a97b77fa7775',
    phoneE164: '+51911111111',
    roles: [UserRole.ADMIN],
    status: 'ACTIVE',
    isPhoneVerified: true,
    createdAt: new Date(),
  };

  function setup(method: string, next: CallHandler) {
    const recorded: CreateAdminAuditLogInput[] = [];
    const record = jest.fn((input: CreateAdminAuditLogInput) => {
      recorded.push(input);
      return Promise.resolve();
    });
    const auditService = { record } as unknown as AdminAuditService;
    const configService = {
      getOrThrow: jest.fn(() => 's'.repeat(64)),
    } as unknown as ConfigService;
    const interceptor = new AdminAuditInterceptor(auditService, configService);
    const request = {
      method,
      originalUrl:
        '/api/v1/admin/safety-incidents/1fbd0a7e-4cc1-4f2b-a5de-4c66931bd605/resolve',
      path: '/admin/safety-incidents/:incidentId/resolve',
      headers: { 'user-agent': 'Jest' },
      ip: '127.0.0.1',
      socket: {},
      user,
    } as unknown as Request;
    const setHeader = jest.fn();
    const response = { statusCode: 200, setHeader } as unknown as Response;
    class TestController {}
    const testHandler = (): void => undefined;
    const context = {
      getType: jest.fn(() => 'http'),
      switchToHttp: jest.fn(() => ({
        getRequest: () => request,
        getResponse: () => response,
      })),
      getClass: jest.fn(() => TestController),
      getHandler: jest.fn(() => testHandler),
    } as unknown as ExecutionContext;
    return { interceptor, context, recorded, setHeader, next };
  }

  it('registra una mutación administrativa exitosa sin almacenar la IP', async () => {
    const fixture = setup('PATCH', { handle: () => of({ ok: true }) });

    await lastValueFrom(
      fixture.interceptor.intercept(fixture.context, fixture.next),
    );

    expect(fixture.recorded[0]).toMatchObject({
      actorUserId: user.id,
      action: 'PATCH api/v1/admin/safety-incidents/:id/resolve',
      resourceType: 'safety-incidents',
      resourceId: '1fbd0a7e-4cc1-4f2b-a5de-4c66931bd605',
      outcome: AdminAuditOutcome.SUCCESS,
      responseStatusCode: 200,
    });
    expect(fixture.recorded[0]?.ipHash).not.toContain('127.0.0.1');
    expect(fixture.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.any(String),
    );
  });

  it('registra el resultado fallido y conserva la excepción original', async () => {
    const error = new BadRequestException('Solicitud inválida');
    const fixture = setup('PATCH', {
      handle: () => throwError(() => error),
    });

    await expect(
      lastValueFrom(
        fixture.interceptor.intercept(fixture.context, fixture.next),
      ),
    ).rejects.toBe(error);
    expect(fixture.recorded[0]).toMatchObject({
      outcome: AdminAuditOutcome.FAILURE,
      responseStatusCode: 400,
    });
    expect(fixture.recorded[0]?.metadata?.errorType).toBe(
      'BadRequestException',
    );
  });

  it('ignora consultas de solo lectura', async () => {
    const fixture = setup('GET', { handle: () => of({ ok: true }) });

    await lastValueFrom(
      fixture.interceptor.intercept(fixture.context, fixture.next),
    );

    expect(fixture.recorded).toHaveLength(0);
  });
});
