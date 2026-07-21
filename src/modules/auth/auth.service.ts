import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterPassengerDto } from './dto/register-passenger.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordService } from './password.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async registerPassenger(
    dto: RegisterPassengerDto,
  ): Promise<RegisterResponseDto> {
    const existingUser = await this.usersService.findByPhoneE164(dto.phoneE164);

    if (existingUser) {
      throw new ConflictException(
        'Ya existe una cuenta registrada con este teléfono',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.usersService.create({
      phoneE164: dto.phoneE164,
      passwordHash,
      roles: [UserRole.PASSENGER],
      status: UserStatus.PENDING,
      isPhoneVerified: false,
    });

    return {
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        roles: user.roles,
        status: user.status,
        isPhoneVerified: user.isPhoneVerified,
        createdAt: user.createdAt,
      },
    };
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByPhoneE164WithPassword(
      dto.phoneE164,
    );

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Teléfono o contraseña incorrectos');
    }

    const passwordIsValid = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException('Teléfono o contraseña incorrectos');
    }

    if (!user.isPhoneVerified || user.status === UserStatus.PENDING) {
      throw new ForbiddenException('Debes verificar tu número telefónico');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        'La cuenta no está habilitada para iniciar sesión',
      );
    }

    const payload: JwtPayload = {
      sub: user.id,
      phoneE164: user.phoneE164,
      roles: user.roles,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const expiresIn = this.configService.getOrThrow<number>(
      'JWT_ACCESS_TTL_SECONDS',
    );

    await this.usersService.markLastLogin(user.id);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,

      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        roles: user.roles,
        status: user.status,
        isPhoneVerified: user.isPhoneVerified,
        createdAt: user.createdAt,
      },
    };
  }
}
