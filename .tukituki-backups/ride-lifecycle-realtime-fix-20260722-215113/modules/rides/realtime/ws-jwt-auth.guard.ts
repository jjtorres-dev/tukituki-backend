import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WsException } from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';

import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { AuthenticatedSocket } from './authenticated-socket.interface';

@Injectable()
export class WsJwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext): IncomingMessage {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    const token = this.extractToken(client);
    const request = client.request;

    request.headers.authorization = token ? `Bearer ${token}` : '';

    return request;
  }

  handleRequest<TUser = AuthenticatedUser>(
    error: unknown,
    user: TUser | false | null,
    _info: unknown,
    context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (error || !user) {
      throw new WsException('Access token inexistente o inválido');
    }

    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    client.data.user = user as AuthenticatedUser;

    return user;
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.trim()) {
      return this.stripBearer(authToken);
    }

    const authorization = client.handshake.headers.authorization;

    if (typeof authorization === 'string' && authorization.trim()) {
      return this.stripBearer(authorization);
    }

    const queryToken = client.handshake.query.token;

    if (typeof queryToken === 'string' && queryToken.trim()) {
      return this.stripBearer(queryToken);
    }

    return null;
  }

  private stripBearer(value: string): string {
    return value.replace(/^Bearer\s+/i, '').trim();
  }
}
