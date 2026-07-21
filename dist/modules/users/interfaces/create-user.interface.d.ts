import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
export interface CreateUserInput {
    phoneE164: string;
    passwordHash?: string | null;
    roles: UserRole[];
    status?: UserStatus;
    isPhoneVerified?: boolean;
}
