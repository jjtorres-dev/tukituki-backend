import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverSuspensionFields1784664104161 implements MigrationInterface {
  name = 'AddDriverSuspensionFields1784664104161';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD "suspension_reason" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD "suspended_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD "suspended_by_user_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_profiles_suspended_by_user_id" ON "driver_profiles"  ("suspended_by_user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD CONSTRAINT "FK_66262ab7942c603dc97c10ace95" FOREIGN KEY ("suspended_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" DROP CONSTRAINT "FK_66262ab7942c603dc97c10ace95"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_profiles_suspended_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" DROP COLUMN "suspended_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" DROP COLUMN "suspended_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" DROP COLUMN "suspension_reason"`,
    );
  }
}
