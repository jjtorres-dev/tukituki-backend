import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverProfiles1784646120026 implements MigrationInterface {
  name = 'CreateDriverProfiles1784646120026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."identity_document_type_enum" AS ENUM('DNI', 'FOREIGNER_CARD', 'PASSPORT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."driver_status_enum" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "first_name" character varying(80) NOT NULL, "last_name" character varying(80) NOT NULL, "document_type" "public"."identity_document_type_enum" NOT NULL, "document_number" character varying(20) NOT NULL, "birth_date" date NOT NULL, "address" character varying(255) NOT NULL, "photo_url" character varying(2048), "status" "public"."driver_status_enum" NOT NULL DEFAULT 'DRAFT', "rejection_reason" character varying(500), "submitted_at" TIMESTAMP WITH TIME ZONE, "approved_at" TIMESTAMP WITH TIME ZONE, "approved_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_cec43742cd6dea0e8fcae3e29d" UNIQUE ("user_id"), CONSTRAINT "PK_6e002fc8a835351e070978fcad4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_profiles_status" ON "driver_profiles"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_profiles_approved_by_user_id" ON "driver_profiles"  ("approved_by_user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_profiles_document_number" ON "driver_profiles"  ("document_number") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_profiles_user_id" ON "driver_profiles"  ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD CONSTRAINT "FK_cec43742cd6dea0e8fcae3e29d8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD CONSTRAINT "FK_79fc6a9b9719fed79524c3844a9" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" DROP CONSTRAINT "FK_79fc6a9b9719fed79524c3844a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" DROP CONSTRAINT "FK_cec43742cd6dea0e8fcae3e29d8"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_driver_profiles_user_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_driver_profiles_document_number"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_profiles_approved_by_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_driver_profiles_status"`);
    await queryRunner.query(`DROP TABLE "driver_profiles"`);
    await queryRunner.query(`DROP TYPE "public"."driver_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."identity_document_type_enum"`);
  }
}
