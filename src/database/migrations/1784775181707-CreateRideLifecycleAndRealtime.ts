import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRideLifecycleAndRealtime1784775181707 implements MigrationInterface {
  name = 'CreateRideLifecycleAndRealtime1784775181707';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ride_status_actor_enum" AS ENUM('PASSENGER', 'DRIVER', 'ADMIN', 'SYSTEM')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "previous_status" "public"."ride_status_enum", "new_status" "public"."ride_status_enum" NOT NULL, "actor_type" "public"."ride_status_actor_enum" NOT NULL, "actor_user_id" uuid, "metadata" jsonb, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2668b7c363b2774279a019fd451" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_status_history_new_status" ON "ride_status_history"  ("new_status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_status_history_ride_occurred_at" ON "ride_status_history"  ("ride_id", "occurred_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "driver_arriving_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "arrival_distance_meters" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "state_version" integer NOT NULL DEFAULT '0'`,
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
      `ALTER TABLE "ride_status_history" ADD CONSTRAINT "FK_f0c1aa2190e477ffb011922036c" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_status_history" ADD CONSTRAINT "FK_20d6736e75c8b5ee9ea1d4fe539" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ride_status_history" DROP CONSTRAINT "FK_20d6736e75c8b5ee9ea1d4fe539"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_status_history" DROP CONSTRAINT "FK_f0c1aa2190e477ffb011922036c"`,
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
    await queryRunner.query(`ALTER TABLE "rides" DROP COLUMN "state_version"`);
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "arrival_distance_meters"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "driver_arriving_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_status_history_ride_occurred_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_status_history_new_status"`,
    );
    await queryRunner.query(`DROP TABLE "ride_status_history"`);
    await queryRunner.query(`DROP TYPE "public"."ride_status_actor_enum"`);
  }
}
