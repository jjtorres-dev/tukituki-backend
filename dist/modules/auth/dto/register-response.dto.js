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
exports.RegisterResponseDto = exports.PublicUserDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const user_role_enum_1 = require("../../users/enums/user-role.enum");
const user_status_enum_1 = require("../../users/enums/user-status.enum");
class PublicUserDto {
    id;
    phoneE164;
    roles;
    status;
    isPhoneVerified;
    createdAt;
}
exports.PublicUserDto = PublicUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        format: 'uuid',
    }),
    __metadata("design:type", String)
], PublicUserDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '+51987654321',
    }),
    __metadata("design:type", String)
], PublicUserDto.prototype, "phoneE164", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: user_role_enum_1.UserRole,
        isArray: true,
    }),
    __metadata("design:type", Array)
], PublicUserDto.prototype, "roles", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: user_status_enum_1.UserStatus,
    }),
    __metadata("design:type", String)
], PublicUserDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], PublicUserDto.prototype, "isPhoneVerified", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: String,
        format: 'date-time',
    }),
    __metadata("design:type", Date)
], PublicUserDto.prototype, "createdAt", void 0);
class RegisterResponseDto {
    user;
}
exports.RegisterResponseDto = RegisterResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: PublicUserDto,
    }),
    __metadata("design:type", PublicUserDto)
], RegisterResponseDto.prototype, "user", void 0);
//# sourceMappingURL=register-response.dto.js.map