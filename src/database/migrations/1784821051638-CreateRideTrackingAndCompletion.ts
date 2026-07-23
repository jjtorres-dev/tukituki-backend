import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRideTrackingAndCompletion1784821051638 implements MigrationInterface {
  name = 'CreateRideTrackingAndCompletion1784821051638';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ride_final_fares" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "fare_rule_id" uuid NOT NULL, "tracked_distance_meters" integer NOT NULL, "actual_duration_seconds" integer NOT NULL, "base_fare" numeric(10,2) NOT NULL, "distance_amount" numeric(10,2) NOT NULL, "time_amount" numeric(10,2) NOT NULL, "booking_fee" numeric(10,2) NOT NULL, "subtotal" numeric(10,2) NOT NULL, "adjustment_multiplier" numeric(6,3) NOT NULL, "calculated_final_fare" numeric(10,2) NOT NULL, "final_fare" numeric(10,2) NOT NULL, "fare_cap_amount" numeric(10,2) NOT NULL, "fare_was_capped" boolean NOT NULL DEFAULT false, "currency" character(3) NOT NULL, "calculation_version" character varying(30) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_3c13f5d12b54a1541e076a7cd8" UNIQUE ("ride_id"), CONSTRAINT "PK_660f2ae8ed421080c833f79abde" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_final_fares_ride_id" ON "ride_final_fares"  ("ride_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ride_location_rejection_reason_enum" AS ENUM('STALE', 'FUTURE_TIMESTAMP', 'LOW_ACCURACY', 'OUT_OF_ORDER', 'TOO_FREQUENT', 'MOVEMENT_TOO_SMALL', 'IMPOSSIBLE_SPEED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_location_samples" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "driver_profile_id" uuid NOT NULL, "position" geography(Point,4326) NOT NULL, "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "accuracy" double precision, "heading" double precision, "speed" double precision, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, "accepted_for_metrics" boolean NOT NULL, "rejection_reason" "public"."ride_location_rejection_reason_enum", "distance_from_previous_meters" numeric(12,2), "cumulative_distance_meters" numeric(12,2) NOT NULL DEFAULT '0.00', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b8bdec08d8b7d7333c1170cc168" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_location_samples_position" ON "ride_location_samples" USING gist ("position") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_location_samples_ride_accepted" ON "ride_location_samples"  ("ride_id", "accepted_for_metrics") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_location_samples_driver_recorded_at" ON "ride_location_samples"  ("driver_profile_id", "recorded_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_location_samples_ride_recorded_at" ON "ride_location_samples"  ("ride_id", "recorded_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_progress_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "accepted_samples" integer NOT NULL DEFAULT '0', "rejected_samples" integer NOT NULL DEFAULT '0', "tracked_distance_meters" numeric(12,2) NOT NULL DEFAULT '0.00', "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_received_sample_at" TIMESTAMP WITH TIME ZONE, "last_accepted_sample_at" TIMESTAMP WITH TIME ZONE, "last_accepted_sample_id" uuid, "calculated_duration_seconds" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_b749863f38d432aae48f7af26f" UNIQUE ("ride_id"), CONSTRAINT "PK_dd0adb0d21bf9c01dcedc29fee0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_progress_metrics_ride_id" ON "ride_progress_metrics"  ("ride_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" ADD "pricing_minimum_fare" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" ADD "pricing_price_per_km" numeric(10,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" ADD "pricing_price_per_minute" numeric(10,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" ADD "pricing_calculation_version" character varying(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "pricing_base_fare" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "pricing_minimum_fare" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "pricing_price_per_km" numeric(10,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "pricing_price_per_minute" numeric(10,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "pricing_booking_fee" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "pricing_adjustment_multiplier" numeric(6,3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "pricing_currency" character(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "pricing_calculation_version" character varying(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "actual_distance_meters" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "actual_duration_seconds" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "destination_arrival_distance_meters" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "calculated_final_fare" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "fare_was_capped" boolean`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "completion_notes" character varying(500)`,
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
      `ALTER TABLE "ride_final_fares" ADD CONSTRAINT "FK_3c13f5d12b54a1541e076a7cd88" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_final_fares" ADD CONSTRAINT "FK_0b8ac7f1501db8f754bb88640f5" FOREIGN KEY ("fare_rule_id") REFERENCES "fare_rules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_location_samples" ADD CONSTRAINT "FK_ea78646f281bb661a130143a099" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_location_samples" ADD CONSTRAINT "FK_27eb8bac2480ea3709d8ff7a693" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_progress_metrics" ADD CONSTRAINT "FK_b749863f38d432aae48f7af26fc" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ride_progress_metrics" DROP CONSTRAINT "FK_b749863f38d432aae48f7af26fc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_location_samples" DROP CONSTRAINT "FK_27eb8bac2480ea3709d8ff7a693"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_location_samples" DROP CONSTRAINT "FK_ea78646f281bb661a130143a099"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_final_fares" DROP CONSTRAINT "FK_0b8ac7f1501db8f754bb88640f5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_final_fares" DROP CONSTRAINT "FK_3c13f5d12b54a1541e076a7cd88"`,
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
      `ALTER TABLE "rides" DROP COLUMN "completion_notes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "fare_was_capped"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "calculated_final_fare"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "destination_arrival_distance_meters"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "actual_duration_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "actual_distance_meters"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "pricing_calculation_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "pricing_currency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "pricing_adjustment_multiplier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "pricing_booking_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "pricing_price_per_minute"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "pricing_price_per_km"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "pricing_minimum_fare"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "pricing_base_fare"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" DROP COLUMN "pricing_calculation_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" DROP COLUMN "pricing_price_per_minute"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" DROP COLUMN "pricing_price_per_km"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" DROP COLUMN "pricing_minimum_fare"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_ride_progress_metrics_ride_id"`,
    );
    await queryRunner.query(`DROP TABLE "ride_progress_metrics"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_location_samples_ride_recorded_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_location_samples_driver_recorded_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_location_samples_ride_accepted"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_location_samples_position"`,
    );
    await queryRunner.query(`DROP TABLE "ride_location_samples"`);
    await queryRunner.query(
      `DROP TYPE "public"."ride_location_rejection_reason_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_ride_final_fares_ride_id"`,
    );
    await queryRunner.query(`DROP TABLE "ride_final_fares"`);
  }
}
