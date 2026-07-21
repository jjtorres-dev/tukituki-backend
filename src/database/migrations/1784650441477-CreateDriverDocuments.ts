import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverDocuments1784650441477 implements MigrationInterface {
  name = 'CreateDriverDocuments1784650441477';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."driver_document_type_enum" AS ENUM('DNI_FRONT', 'DNI_BACK', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'SOAT', 'PROFILE_PHOTO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."driver_document_status_enum" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driver_profile_id" uuid NOT NULL, "type" "public"."driver_document_type_enum" NOT NULL, "file_url" character varying(2048) NOT NULL, "document_number" character varying(50), "issued_at" date, "expires_at" date, "status" "public"."driver_document_status_enum" NOT NULL DEFAULT 'DRAFT', "rejection_reason" character varying(500), "reviewed_at" TIMESTAMP WITH TIME ZONE, "reviewed_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_31c28b4e8f55a5d411597d45ab2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_documents_reviewed_by_user_id" ON "driver_documents"  ("reviewed_by_user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_documents_expires_at" ON "driver_documents"  ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_documents_status" ON "driver_documents"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_documents_driver_profile_id" ON "driver_documents"  ("driver_profile_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_documents_profile_type" ON "driver_documents"  ("driver_profile_id", "type") `,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_documents" ADD CONSTRAINT "FK_1337fb46e8277c02cfcec52a08b" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_documents" ADD CONSTRAINT "FK_cbdcd05311dee66375104426662" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "driver_documents" DROP CONSTRAINT "FK_cbdcd05311dee66375104426662"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_documents" DROP CONSTRAINT "FK_1337fb46e8277c02cfcec52a08b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_driver_documents_profile_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_documents_driver_profile_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_documents_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_documents_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_documents_reviewed_by_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "driver_documents"`);
    await queryRunner.query(`DROP TYPE "public"."driver_document_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."driver_document_type_enum"`);
  }
}
