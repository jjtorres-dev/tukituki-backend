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
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_1 = require("redis");
let RedisService = RedisService_1 = class RedisService {
    configService;
    logger = new common_1.Logger(RedisService_1.name);
    client;
    constructor(configService) {
        this.configService = configService;
        const host = this.configService.getOrThrow('REDIS_HOST');
        const port = this.configService.getOrThrow('REDIS_PORT');
        this.client = (0, redis_1.createClient)({
            url: `redis://${host}:${port}`,
        });
        this.client.on('error', (error) => {
            this.logger.error('Error de conexión con Redis', error);
        });
    }
    async onModuleInit() {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
        this.logger.log('Conexión con Redis establecida');
    }
    async onModuleDestroy() {
        if (this.client.isOpen) {
            await this.client.quit();
        }
    }
    get(key) {
        return this.client.get(key);
    }
    async setWithTtl(key, value, ttlSeconds) {
        await this.client.set(key, value, {
            EX: ttlSeconds,
        });
    }
    async exists(key) {
        return (await this.client.exists(key)) === 1;
    }
    async increment(key) {
        return this.client.incr(key);
    }
    async expire(key, ttlSeconds) {
        await this.client.expire(key, ttlSeconds);
    }
    ttl(key) {
        return this.client.ttl(key);
    }
    async delete(...keys) {
        if (keys.length > 0) {
            await this.client.del(keys);
        }
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map