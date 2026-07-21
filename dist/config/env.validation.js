"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.envValidationSchema = void 0;
const Joi = __importStar(require("joi"));
exports.envValidationSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'test', 'production')
        .default('development'),
    APP_NAME: Joi.string().default('TukiTuki Backend'),
    PORT: Joi.number().port().default(3001),
    API_PREFIX: Joi.string().default('api/v1'),
    ADMIN_WEB_ORIGIN: Joi.string().uri().default('http://localhost:3000'),
    DATABASE_HOST: Joi.string().required(),
    DATABASE_PORT: Joi.number().port().default(5432),
    DATABASE_NAME: Joi.string().required(),
    DATABASE_USER: Joi.string().required(),
    DATABASE_PASSWORD: Joi.string().min(8).required(),
    DATABASE_SSL: Joi.boolean().default(false),
    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.number().port().default(6379),
    OTP_TTL_SECONDS: Joi.number().integer().min(60).max(600).default(300),
    OTP_RESEND_COOLDOWN_SECONDS: Joi.number()
        .integer()
        .min(30)
        .max(300)
        .default(60),
    OTP_MAX_ATTEMPTS: Joi.number().integer().min(3).max(10).default(5),
    OTP_HASH_SECRET: Joi.string().min(32).required(),
    JWT_ACCESS_SECRET: Joi.string().min(64).required(),
    JWT_ACCESS_TTL_SECONDS: Joi.number()
        .integer()
        .min(300)
        .max(3600)
        .default(900),
});
//# sourceMappingURL=env.validation.js.map