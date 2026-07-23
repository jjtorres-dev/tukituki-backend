import type { Socket } from 'socket.io';

import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

export interface AuthenticatedSocketData {
  user?: AuthenticatedUser;
}

export type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  AuthenticatedSocketData
>;
