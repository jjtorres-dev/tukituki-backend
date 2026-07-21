import type { User } from '../../users/entities/user.entity';

export interface CreateAuthSessionInput {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreatedAuthSession {
  sessionId: string;
  refreshToken: string;
  refreshExpiresIn: number;
  expiresAt: Date;
}

export interface RotatedAuthSession {
  sessionId: string;
  refreshToken: string;
  refreshExpiresIn: number;
  expiresAt: Date;
  user: User;
}
