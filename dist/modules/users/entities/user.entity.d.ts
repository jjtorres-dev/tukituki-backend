import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
export declare class User {
    id: string;
    phoneE164: string;
    passwordHash: string | null;
    roles: UserRole[];
    status: UserStatus;
    isPhoneVerified: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
