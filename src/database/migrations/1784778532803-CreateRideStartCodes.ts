import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRideStartCodes1784778532803 implements MigrationInterface {
  name = 'CreateRideStartCodes1784778532803';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ride_start_code_status_enum" AS ENUM('ACTIVE', 'USED', 'EXPIRED', 'LOCKED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_start_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "nonce" character varying(64) NOT NULL, "status" "public"."ride_start_code_status_enum" NOT NULL DEFAULT 'ACTIVE', "failed_attempts" smallint NOT NULL DEFAULT '0', "maximum_attempts" smallint NOT NULL, "regeneration_count" smallint NOT NULL DEFAULT '0', "maximum_regenerations" smallint NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "locked_at" TIMESTAMP WITH TIME ZONE, "regenerated_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_9394f555e1723506f4cc3697cd" UNIQUE ("ride_id"), CONSTRAINT "CHK_ride_start_codes_regenerations" CHECK ("regeneration_count" >= 0 AND "maximum_regenerations" > 0 AND "regeneration_count" <= "maximum_regenerations"), CONSTRAINT "CHK_ride_start_codes_attempts" CHECK ("failed_attempts" >= 0 AND "maximum_attempts" > 0 AND "failed_attempts" <= "maximum_attempts"), CONSTRAINT "PK_4e0c5f63fad435ce3c5c7036444" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_start_codes_status_expires_at" ON "ride_start_codes"  ("status", "expires_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_start_codes_ride_id" ON "ride_start_codes"  ("ride_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "booking_fee" SET DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "waiting_price_per_minute" SET DEFAULT '0.0000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "cancellation_fee" SET DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "night_multiplier" SET DEFAULT '1.000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "rain_multiplier" SET DEFAULT '1.000'`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_start_codes" ADD CONSTRAINT "FK_9394f555e1723506f4cc3697cd1" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ride_start_codes" DROP CONSTRAINT "FK_9394f555e1723506f4cc3697cd1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "rain_multiplier" SET DEFAULT 1.000`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "night_multiplier" SET DEFAULT 1.000`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "cancellation_fee" SET DEFAULT 0.00`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "waiting_price_per_minute" SET DEFAULT 0.0000`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ALTER COLUMN "booking_fee" SET DEFAULT 0.00`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_ride_start_codes_ride_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_start_codes_status_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "ride_start_codes"`);
    await queryRunner.query(`DROP TYPE "public"."ride_start_code_status_enum"`);
  }
}
