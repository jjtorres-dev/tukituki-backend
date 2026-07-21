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
exports.RegisterPassengerDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class RegisterPassengerDto {
    phoneE164;
    password;
}
exports.RegisterPassengerDto = RegisterPassengerDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '+51987654321',
        description: 'Número móvil peruano en formato internacional E.164',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\+519\d{8}$/, {
        message: 'El teléfono debe tener el formato +519XXXXXXXX',
    }),
    __metadata("design:type", String)
], RegisterPassengerDto.prototype, "phoneE164", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'TukiTuki2026',
        minLength: 8,
        maxLength: 64,
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8, {
        message: 'La contraseña debe tener al menos 8 caracteres',
    }),
    (0, class_validator_1.MaxLength)(64, {
        message: 'La contraseña no puede superar los 64 caracteres',
    }),
    (0, class_validator_1.Matches)(/[a-z]/, {
        message: 'La contraseña debe incluir una letra minúscula',
    }),
    (0, class_validator_1.Matches)(/[A-Z]/, {
        message: 'La contraseña debe incluir una letra mayúscula',
    }),
    (0, class_validator_1.Matches)(/\d/, {
        message: 'La contraseña debe incluir un número',
    }),
    __metadata("design:type", String)
], RegisterPassengerDto.prototype, "password", void 0);
//# sourceMappingURL=register-passenger.dto.js.map