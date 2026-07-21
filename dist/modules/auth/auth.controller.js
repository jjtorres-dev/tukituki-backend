"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("./auth.service");
const current_user_decorator_1 = require("./decorators/current-user.decorator");
const login_dto_1 = require("./dto/login.dto");
const login_response_dto_1 = require("./dto/login-response.dto");
const register_passenger_dto_1 = require("./dto/register-passenger.dto");
const register_response_dto_1 = require("./dto/register-response.dto");
const request_phone_otp_dto_1 = require("./dto/request-phone-otp.dto");
const verify_phone_otp_dto_1 = require("./dto/verify-phone-otp.dto");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const otp_service_1 = require("./otp.service");
let AuthController = class AuthController {
    authService;
    otpService;
    constructor(authService, otpService) {
        this.authService = authService;
        this.otpService = otpService;
    }
    registerPassenger(dto) {
        return this.authService.registerPassenger(dto);
    }
    requestPhoneOtp(dto) {
        return this.otpService.requestPhoneVerification(dto.phoneE164);
    }
    verifyPhoneOtp(dto) {
        return this.otpService.verifyPhone(dto.phoneE164, dto.code);
    }
    login(dto) {
        return this.authService.login(dto);
    }
    me(user) {
        return user;
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register/passenger'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({
        summary: 'Registrar una cuenta de pasajero',
    }),
    (0, swagger_1.ApiCreatedResponse)({
        description: 'Pasajero registrado correctamente',
        type: register_response_dto_1.RegisterResponseDto,
    }),
    (0, swagger_1.ApiBadRequestResponse)({
        description: 'Los datos enviados no son válidos',
    }),
    (0, swagger_1.ApiConflictResponse)({
        description: 'El teléfono ya está registrado',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_passenger_dto_1.RegisterPassengerDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registerPassenger", null);
__decorate([
    (0, common_1.Post)('otp/request'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Solicitar código OTP para verificar el teléfono',
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Código OTP generado correctamente',
    }),
    (0, swagger_1.ApiConflictResponse)({
        description: 'El teléfono ya está verificado',
    }),
    (0, swagger_1.ApiTooManyRequestsResponse)({
        description: 'Debe esperar antes de solicitar otro código',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [request_phone_otp_dto_1.RequestPhoneOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestPhoneOtp", null);
__decorate([
    (0, common_1.Post)('otp/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Verificar el código OTP',
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Teléfono verificado correctamente',
    }),
    (0, swagger_1.ApiBadRequestResponse)({
        description: 'El código expiró o no existe',
    }),
    (0, swagger_1.ApiUnauthorizedResponse)({
        description: 'El código OTP es incorrecto',
    }),
    (0, swagger_1.ApiTooManyRequestsResponse)({
        description: 'Número máximo de intentos superado',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_phone_otp_dto_1.VerifyPhoneOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyPhoneOtp", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Iniciar sesión con teléfono y contraseña',
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Inicio de sesión correcto',
        type: login_response_dto_1.LoginResponseDto,
    }),
    (0, swagger_1.ApiUnauthorizedResponse)({
        description: 'Teléfono o contraseña incorrectos',
    }),
    (0, swagger_1.ApiForbiddenResponse)({
        description: 'La cuenta no está verificada o habilitada',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Obtener el usuario autenticado',
    }),
    (0, swagger_1.ApiOkResponse)({
        type: register_response_dto_1.PublicUserDto,
    }),
    (0, swagger_1.ApiUnauthorizedResponse)({
        description: 'Token inexistente, inválido o vencido',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        otp_service_1.OtpService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map