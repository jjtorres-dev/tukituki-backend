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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("./entities/user.entity");
const user_status_enum_1 = require("./enums/user-status.enum");
let UsersService = class UsersService {
    usersRepository;
    constructor(usersRepository) {
        this.usersRepository = usersRepository;
    }
    findById(id) {
        return this.usersRepository.findOne({
            where: { id },
        });
    }
    findByPhoneE164(phoneE164) {
        return this.usersRepository.findOne({
            where: { phoneE164 },
        });
    }
    findByPhoneE164WithPassword(phoneE164) {
        return this.usersRepository
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .where('user.phoneE164 = :phoneE164', {
            phoneE164,
        })
            .getOne();
    }
    async create(input) {
        const user = this.usersRepository.create({
            phoneE164: input.phoneE164,
            passwordHash: input.passwordHash ?? null,
            roles: input.roles,
            status: input.status ?? user_status_enum_1.UserStatus.PENDING,
            isPhoneVerified: input.isPhoneVerified ?? false,
            lastLoginAt: null,
        });
        try {
            return await this.usersRepository.save(user);
        }
        catch (error) {
            if (this.isUniqueConstraintViolation(error)) {
                throw new common_1.ConflictException('Ya existe una cuenta registrada con este teléfono');
            }
            throw error;
        }
    }
    async activatePhone(phoneE164) {
        const user = await this.findByPhoneE164(phoneE164);
        if (!user) {
            throw new common_1.NotFoundException('No existe una cuenta registrada con este teléfono');
        }
        user.isPhoneVerified = true;
        user.status = user_status_enum_1.UserStatus.ACTIVE;
        return this.usersRepository.save(user);
    }
    async markLastLogin(userId) {
        await this.usersRepository.update({
            id: userId,
        }, {
            lastLoginAt: new Date(),
        });
    }
    isUniqueConstraintViolation(error) {
        if (!(error instanceof typeorm_2.QueryFailedError)) {
            return false;
        }
        const driverError = error.driverError;
        return driverError.code === '23505';
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], UsersService);
//# sourceMappingURL=users.service.js.map