import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiNoContentResponse,
  ApiParam,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterPassengerDto } from './dto/register-passenger.dto';
import {
  PublicUserDto,
  RegisterResponseDto,
} from './dto/register-response.dto';
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { OtpService } from './otp.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import type { Request } from 'express';
import { AuthSessionsService } from '../auth-sessions/auth-sessions.service';
import {
  AuthSessionResponseDto,
  LogoutAllResponseDto,
} from './dto/auth-session-response.dto';
import { Roles } from '../authorization/decorators/roles.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly authSessionsService: AuthSessionsService,
  ) {}

  @Post('register/passenger')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar una cuenta de pasajero',
  })
  @ApiCreatedResponse({
    description: 'Pasajero registrado correctamente',
    type: RegisterResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Los datos enviados no son válidos',
  })
  @ApiConflictResponse({
    description: 'El teléfono ya está registrado',
  })
  registerPassenger(
    @Body() dto: RegisterPassengerDto,
  ): Promise<RegisterResponseDto> {
    return this.authService.registerPassenger(dto);
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar código OTP para verificar el teléfono',
  })
  @ApiOkResponse({
    description: 'Código OTP generado correctamente',
  })
  @ApiConflictResponse({
    description: 'El teléfono ya está verificado',
  })
  @ApiTooManyRequestsResponse({
    description: 'Debe esperar antes de solicitar otro código',
  })
  requestPhoneOtp(@Body() dto: RequestPhoneOtpDto) {
    return this.otpService.requestPhoneVerification(dto.phoneE164);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar el código OTP',
  })
  @ApiOkResponse({
    description: 'Teléfono verificado correctamente',
  })
  @ApiBadRequestResponse({
    description: 'El código expiró o no existe',
  })
  @ApiUnauthorizedResponse({
    description: 'El código OTP es incorrecto',
  })
  @ApiTooManyRequestsResponse({
    description: 'Número máximo de intentos superado',
  })
  verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto) {
    return this.otpService.verifyPhone(dto.phoneE164, dto.code);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión con teléfono y contraseña',
  })
  @ApiOkResponse({
    description: 'Inicio de sesión correcto',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Teléfono o contraseña incorrectos',
  })
  @ApiForbiddenResponse({
    description: 'La cuenta no está verificada o habilitada',
  })
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<LoginResponseDto> {
    return this.authService.login(dto, {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Get('me')
  @Roles(...Object.values(UserRole))
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener el usuario autenticado',
  })
  @ApiOkResponse({
    type: PublicUserDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Token inexistente, inválido o vencido',
  })
  @ApiForbiddenResponse({
    description: 'El usuario no posee un rol permitido',
  })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar los tokens de una sesión',
  })
  @ApiOkResponse({
    description: 'Tokens renovados correctamente',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token inválido, revocado o vencido',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<LoginResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar la sesión actual',
  })
  @ApiNoContentResponse({
    description: 'Sesión cerrada correctamente',
  })
  @ApiUnauthorizedResponse({
    description: 'Token inexistente, inválido o vencido',
  })
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authSessionsService.revoke(user.id, user.sessionId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar las sesiones activas del usuario',
  })
  @ApiOkResponse({
    type: AuthSessionResponseDto,
    isArray: true,
  })
  async sessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuthSessionResponseDto[]> {
    const sessions = await this.authSessionsService.findActiveByUser(user.id);

    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      isCurrent: session.id === user.sessionId,
    }));
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar una sesión específica',
  })
  @ApiParam({
    name: 'sessionId',
    format: 'uuid',
  })
  @ApiNoContentResponse({
    description: 'Sesión cerrada correctamente',
  })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,

    @Param(
      'sessionId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    sessionId: string,
  ): Promise<void> {
    await this.authSessionsService.revoke(user.id, sessionId);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar todas las sesiones del usuario',
  })
  @ApiOkResponse({
    type: LogoutAllResponseDto,
  })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LogoutAllResponseDto> {
    const revokedSessions = await this.authSessionsService.revokeAll(user.id);

    return {
      revokedSessions,
    };
  }
}
