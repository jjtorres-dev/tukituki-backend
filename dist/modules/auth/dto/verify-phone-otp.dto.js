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
exports.VerifyPhoneOtpDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class VerifyPhoneOtpDto {
    phoneE164;
    code;
}
exports.VerifyPhoneOtpDto = VerifyPhoneOtpDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '+51987654321',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\+519\d{8}$/, {
        message: 'El teléfono debe tener el formato +519XXXXXXXX',
    }),
    __metadata("design:type", String)
], VerifyPhoneOtpDto.prototype, "phoneE164", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '482913',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{6}$/, {
        message: 'El código OTP debe contener exactamente 6 dígitos',
    }),
    __metadata("design:type", String)
], VerifyPhoneOtpDto.prototype, "code", void 0);
//# sourceMappingURL=verify-phone-otp.dto.js.map