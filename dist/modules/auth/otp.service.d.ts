import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { UsersService } from '../users/users.service';
export declare class OtpService {
    private readonly redisService;
    private readonly usersService;
    private readonly configService;
    constructor(redisService: RedisService, usersService: UsersService, configService: ConfigService);
    requestPhoneVerification(phoneE164: string): Promise<{
        expiresIn: number;
        debugOtp?: string;
    }>;
    verifyPhone(phoneE164: string, code: string): Promise<{
        user: {
            id: string;
            phoneE164: string;
            roles: import("../users/enums/user-role.enum").UserRole[];
            status: import("../users/enums/user-status.enum").UserStatus;
            isPhoneVerified: boolean;
            createdAt: Date;
        };
    }>;
    private hashCode;
    private areHashesEqual;
    private getOtpKey;
    private getAttemptsKey;
    private getCooldownKey;
    private clearOtp;
}
