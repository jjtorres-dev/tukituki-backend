import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterPassengerDto } from './dto/register-passenger.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { OtpService } from './otp.service';
export declare class AuthController {
    private readonly authService;
    private readonly otpService;
    constructor(authService: AuthService, otpService: OtpService);
    registerPassenger(dto: RegisterPassengerDto): Promise<RegisterResponseDto>;
    requestPhoneOtp(dto: RequestPhoneOtpDto): Promise<{
        expiresIn: number;
        debugOtp?: string;
    }>;
    verifyPhoneOtp(dto: VerifyPhoneOtpDto): Promise<{
        user: {
            id: string;
            phoneE164: string;
            roles: import("../users/enums/user-role.enum").UserRole[];
            status: import("../users/enums/user-status.enum").UserStatus;
            isPhoneVerified: boolean;
            createdAt: Date;
        };
    }>;
    login(dto: LoginDto): Promise<LoginResponseDto>;
    me(user: AuthenticatedUser): AuthenticatedUser;
}
