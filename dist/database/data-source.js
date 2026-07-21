"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_path_1 = require("node:path");
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../modules/users/entities/user.entity");
function getRequiredEnvironmentVariable(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
    }
    return value;
}
const databasePort = Number(getRequiredEnvironmentVariable('DATABASE_PORT'));
if (!Number.isInteger(databasePort)) {
    throw new Error('DATABASE_PORT debe ser un número entero');
}
const AppDataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: getRequiredEnvironmentVariable('DATABASE_HOST'),
    port: databasePort,
    database: getRequiredEnvironmentVariable('DATABASE_NAME'),
    username: getRequiredEnvironmentVariable('DATABASE_USER'),
    password: getRequiredEnvironmentVariable('DATABASE_PASSWORD'),
    ssl: process.env.DATABASE_SSL === 'true'
        ? {
            rejectUnauthorized: false,
        }
        : false,
    entities: [user_entity_1.User],
    migrations: [(0, node_path_1.join)(__dirname, 'migrations', '*.js')],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
});
exports.default = AppDataSource;
//# sourceMappingURL=data-source.js.map