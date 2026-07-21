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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const user_role_enum_1 = require("../users/enums/user-role.enum");
const user_status_enum_1 = require("../users/enums/user-status.enum");
const users_service_1 = require("../users/users.service");
const password_service_1 = require("./password.service");
let AuthService = class AuthService {
    usersService;
    passwordService;
    jwtService;
    configService;
    constructor(usersService, passwordService, jwtService, configService) {
        this.usersService = usersService;
        this.passwordService = passwordService;
        this.jwtService = jwtService;
        this.configService = configService;
    }
    async registerPassenger(dto) {
        const existingUser = await this.usersService.findByPhoneE164(dto.phoneE164);
        if (existingUser) {
            throw new common_1.ConflictException('Ya existe una cuenta registrada con este teléfono');
        }
        const passwordHash = await this.passwordService.hash(dto.password);
        const user = await this.usersService.create({
            phoneE164: dto.phoneE164,
            passwordHash,
            roles: [user_role_enum_1.UserRole.PASSENGER],
            status: user_status_enum_1.UserStatus.PENDING,
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
    async login(dto) {
        const user = await this.usersService.findByPhoneE164WithPassword(dto.phoneE164);
        if (!user || !user.passwordHash) {
            throw new common_1.UnauthorizedException('Teléfono o contraseña incorrectos');
        }
        const passwordIsValid = await this.passwordService.verify(dto.password, user.passwordHash);
        if (!passwordIsValid) {
            throw new common_1.UnauthorizedException('Teléfono o contraseña incorrectos');
        }
        if (!user.isPhoneVerified || user.status === user_status_enum_1.UserStatus.PENDING) {
            throw new common_1.ForbiddenException('Debes verificar tu número telefónico');
        }
        if (user.status !== user_status_enum_1.UserStatus.ACTIVE) {
            throw new common_1.ForbiddenException('La cuenta no está habilitada para iniciar sesión');
        }
        const payload = {
            sub: user.id,
            phoneE164: user.phoneE164,
            roles: user.roles,
            type: 'access',
        };
        const accessToken = await this.jwtService.signAsync(payload);
        const expiresIn = this.configService.getOrThrow('JWT_ACCESS_TTL_SECONDS');
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        password_service_1.PasswordService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map