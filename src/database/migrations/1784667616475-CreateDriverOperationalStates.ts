import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverOperationalStates1784667616475 implements MigrationInterface {
  name = 'CreateDriverOperationalStates1784667616475';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."driver_operational_status_enum" AS ENUM('OFFLINE', 'AVAILABLE', 'BUSY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_operational_states" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driver_profile_id" uuid NOT NULL, "status" "public"."driver_operational_status_enum" NOT NULL DEFAULT 'OFFLINE', "connected_at" TIMESTAMP WITH TIME ZONE, "disconnected_at" TIMESTAMP WITH TIME ZONE, "last_seen_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_6f180904efb851660937f75884" UNIQUE ("driver_profile_id"), CONSTRAINT "PK_a573a37d42a00f5aa8ac29bb661" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_operational_states_last_seen_at" ON "driver_operational_states"  ("last_seen_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_operational_states_status" ON "driver_operational_states"  ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_operational_states_driver_profile_id" ON "driver_operational_states"  ("driver_profile_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_operational_states" ADD CONSTRAINT "FK_6f180904efb851660937f758840" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "driver_operational_states" DROP CONSTRAINT "FK_6f180904efb851660937f758840"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_driver_operational_states_driver_profile_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_operational_states_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_operational_states_last_seen_at"`,
    );
    await queryRunner.query(`DROP TABLE "driver_operational_states"`);
    await queryRunner.query(
      `DROP TYPE "public"."driver_operational_status_enum"`,
    );
  }
}
