import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterPassengerDto } from './dto/register-passenger.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { PasswordService } from './password.service';
export declare class AuthService {
    private readonly usersService;
    private readonly passwordService;
    private readonly jwtService;
    private readonly configService;
    constructor(usersService: UsersService, passwordService: PasswordService, jwtService: JwtService, configService: ConfigService);
    registerPassenger(dto: RegisterPassengerDto): Promise<RegisterResponseDto>;
    login(dto: LoginDto): Promise<LoginResponseDto>;
}
