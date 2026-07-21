import { UserRole } from '../../users/enums/user-role.enum';

export interface JwtPayload {
  sub: string;
  phoneE164: string;
  roles: UserRole[];
  type: 'access';
}
