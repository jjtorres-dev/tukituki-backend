import { UserRole } from '../../users/enums/user-role.enum';

export interface JwtPayload {
  sub: string;
  sid: string;
  phoneE164: string;
  roles: UserRole[];
  type: 'access';
}
