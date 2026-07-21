import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';
export declare class PublicUserDto {
    id: string;
    phoneE164: string;
    roles: UserRole[];
    status: UserStatus;
    isPhoneVerified: boolean;
    createdAt: Date;
}
export declare class RegisterResponseDto {
    user: PublicUserDto;
}
