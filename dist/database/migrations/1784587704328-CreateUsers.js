"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateUsers1784587704328 = void 0;
class CreateUsers1784587704328 {
    name = 'CreateUsers1784587704328';
    async up(queryRunner) {
        await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('PASSENGER', 'DRIVER', 'ADMIN', 'SUPER_ADMIN')`);
        await queryRunner.query(`CREATE TYPE "public"."user_status_enum" AS ENUM('ACTIVE', 'PENDING', 'SUSPENDED', 'BLOCKED')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "phone_e164" character varying(20) NOT NULL, "password_hash" character varying(255), "roles" "public"."user_role_enum" array NOT NULL, "status" "public"."user_status_enum" NOT NULL DEFAULT 'PENDING', "is_phone_verified" boolean NOT NULL DEFAULT false, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_phone_e164" ON "users"  ("phone_e164") `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."UQ_users_phone_e164"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."user_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
    }
}
exports.CreateUsers1784587704328 = CreateUsers1784587704328;
//# sourceMappingURL=1784587704328-CreateUsers.js.map