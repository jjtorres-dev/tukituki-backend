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
exports.OtpService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const redis_service_1 = require("../../infrastructure/redis/redis.service");
const users_service_1 = require("../users/users.service");
let OtpService = class OtpService {
    redisService;
    usersService;
    configService;
    constructor(redisService, usersService, configService) {
        this.redisService = redisService;
        this.usersService = usersService;
        this.configService = configService;
    }
    async requestPhoneVerification(phoneE164) {
        const user = await this.usersService.findByPhoneE164(phoneE164);
        if (!user) {
            throw new common_1.NotFoundException('No existe una cuenta registrada con este teléfono');
        }
        if (user.isPhoneVerified) {
            throw new common_1.ConflictException('El teléfono ya se encuentra verificado');
        }
        const cooldownKey = this.getCooldownKey(phoneE164);
        if (await this.redisService.exists(cooldownKey)) {
            const retryAfter = await this.redisService.ttl(cooldownKey);
            throw new common_1.HttpException(`Debes esperar ${retryAfter} segundos para solicitar otro código`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const ttl = this.configService.getOrThrow('OTP_TTL_SECONDS');
        const cooldown = this.configService.getOrThrow('OTP_RESEND_COOLDOWN_SECONDS');
        const code = (0, node_crypto_1.randomInt)(0, 1_000_000).toString().padStart(6, '0');
        const codeHash = this.hashCode(phoneE164, code);
        await Promise.all([
            this.redisService.setWithTtl(this.getOtpKey(phoneE164), codeHash, ttl),
            this.redisService.setWithTtl(this.getAttemptsKey(phoneE164), '0', ttl),
            this.redisService.setWithTtl(cooldownKey, '1', cooldown),
        ]);
        const nodeEnvironment = this.configService.getOrThrow('NODE_ENV');
        return {
            expiresIn: ttl,
            ...(nodeEnvironment === 'development'
                ? {
                    debugOtp: code,
                }
                : {}),
        };
    }
    async verifyPhone(phoneE164, code) {
        const otpKey = this.getOtpKey(phoneE164);
        const attemptsKey = this.getAttemptsKey(phoneE164);
        const storedHash = await this.redisService.get(otpKey);
        if (!storedHash) {
            throw new common_1.BadRequestException('El código ha expirado o no existe');
        }
        const maxAttempts = this.configService.getOrThrow('OTP_MAX_ATTEMPTS');
        const attempts = Number((await this.redisService.get(attemptsKey)) ?? '0');
        if (attempts >= maxAttempts) {
            await this.clearOtp(phoneE164);
            throw new common_1.HttpException('Superaste el número máximo de intentos', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const candidateHash = this.hashCode(phoneE164, code);
        if (!this.areHashesEqual(storedHash, candidateHash)) {
            const currentAttempts = await this.redisService.increment(attemptsKey);
            if (currentAttempts >= maxAttempts) {
                await this.clearOtp(phoneE164);
                throw new common_1.HttpException('Superaste el número máximo de intentos', common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
            throw new common_1.UnauthorizedException('El código OTP es incorrecto');
        }
        const user = await this.usersService.activatePhone(phoneE164);
        await this.clearOtp(phoneE164);
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
    hashCode(phoneE164, code) {
        const secret = this.configService.getOrThrow('OTP_HASH_SECRET');
        return (0, node_crypto_1.createHmac)('sha256', secret)
            .update(`${phoneE164}:${code}`)
            .digest('hex');
    }
    areHashesEqual(storedHash, candidateHash) {
        const storedBuffer = Buffer.from(storedHash, 'hex');
        const candidateBuffer = Buffer.from(candidateHash, 'hex');
        return (storedBuffer.length === candidateBuffer.length &&
            (0, node_crypto_1.timingSafeEqual)(storedBuffer, candidateBuffer));
    }
    getOtpKey(phoneE164) {
        return `auth:otp:phone:${phoneE164}`;
    }
    getAttemptsKey(phoneE164) {
        return `auth:otp:phone:${phoneE164}:attempts`;
    }
    getCooldownKey(phoneE164) {
        return `auth:otp:phone:${phoneE164}:cooldown`;
    }
    async clearOtp(phoneE164) {
        await this.redisService.delete(this.getOtpKey(phoneE164), this.getAttemptsKey(phoneE164), this.getCooldownKey(phoneE164));
    }
};
exports.OtpService = OtpService;
exports.OtpService = OtpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        users_service_1.UsersService,
        config_1.ConfigService])
], OtpService);
//# sourceMappingURL=otp.service.js.map