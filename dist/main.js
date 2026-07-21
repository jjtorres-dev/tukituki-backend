"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const port = configService.getOrThrow('PORT');
    const apiPrefix = configService.getOrThrow('API_PREFIX');
    const adminWebOrigin = configService.getOrThrow('ADMIN_WEB_ORIGIN');
    app.setGlobalPrefix(apiPrefix);
    app.enableCors({
        origin: adminWebOrigin,
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    app.enableShutdownHooks();
    const swaggerConfiguration = new swagger_1.DocumentBuilder()
        .setTitle('TukiTuki API')
        .setDescription('API central para pasajeros, conductores y administración de TukiTuki')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build();
    const swaggerDocument = swagger_1.SwaggerModule.createDocument(app, swaggerConfiguration);
    swagger_1.SwaggerModule.setup('docs', app, swaggerDocument, {
        jsonDocumentUrl: 'docs-json',
    });
    await app.listen(port, '0.0.0.0');
    console.log(`TukiTuki Backend: http://localhost:${port}/${apiPrefix}`);
    console.log(`Swagger: http://localhost:${port}/docs`);
}
void bootstrap();
//# sourceMappingURL=main.js.map