import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFareQuotesAndRides1784766330109 implements MigrationInterface {
  name = 'CreateFareQuotesAndRides1784766330109';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."fare_quote_status_enum" AS ENUM('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fare_quotes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "passenger_user_id" uuid NOT NULL, "fare_rule_id" uuid NOT NULL, "origin_zone_id" uuid NOT NULL, "destination_zone_id" uuid NOT NULL, "origin_position" geography(Point,4326) NOT NULL, "destination_position" geography(Point,4326) NOT NULL, "origin_address" character varying(300) NOT NULL, "destination_address" character varying(300) NOT NULL, "distance_meters" integer NOT NULL, "duration_seconds" integer NOT NULL, "base_fare" numeric(10,2) NOT NULL, "distance_amount" numeric(10,2) NOT NULL, "time_amount" numeric(10,2) NOT NULL, "booking_fee" numeric(10,2) NOT NULL, "subtotal" numeric(10,2) NOT NULL, "adjustment_multiplier" numeric(6,3) NOT NULL, "estimated_fare" numeric(10,2) NOT NULL, "currency" character(3) NOT NULL, "is_night" boolean NOT NULL DEFAULT false, "is_raining" boolean NOT NULL DEFAULT false, "status" "public"."fare_quote_status_enum" NOT NULL DEFAULT 'ACTIVE', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_98174338d208ce57bf82db91c23" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fare_quotes_origin_position" ON "fare_quotes" USING gist ("origin_position") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fare_quotes_destination_position" ON "fare_quotes" USING gist ("destination_position") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fare_quotes_status_expires_at" ON "fare_quotes"  ("status", "expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fare_quotes_passenger_status_expires_at" ON "fare_quotes"  ("passenger_user_id", "status", "expires_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ride_status_enum" AS ENUM('SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ride_cancellation_actor_enum" AS ENUM('PASSENGER', 'DRIVER', 'ADMIN', 'SYSTEM')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rides" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "passenger_user_id" uuid NOT NULL, "driver_profile_id" uuid, "fare_quote_id" uuid NOT NULL, "origin_zone_id" uuid NOT NULL, "destination_zone_id" uuid NOT NULL, "origin_position" geography(Point,4326) NOT NULL, "destination_position" geography(Point,4326) NOT NULL, "origin_address" character varying(300) NOT NULL, "destination_address" character varying(300) NOT NULL, "distance_meters" integer NOT NULL, "estimated_duration_seconds" integer NOT NULL, "estimated_fare" numeric(10,2) NOT NULL, "final_fare" numeric(10,2), "currency" character(3) NOT NULL, "status" "public"."ride_status_enum" NOT NULL DEFAULT 'SEARCHING_DRIVER', "passenger_notes" character varying(500), "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL, "search_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "driver_assigned_at" TIMESTAMP WITH TIME ZONE, "driver_arrived_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancellation_reason" character varying(300), "cancelled_by" "public"."ride_cancellation_actor_enum", "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_33804da5c8fa161c8a43298b0a0" UNIQUE ("fare_quote_id"), CONSTRAINT "PK_ca6f62fc1e999b139c7f28f07fd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_origin_position" ON "rides" USING gist ("origin_position") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_destination_position" ON "rides" USING gist ("destination_position") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_rides_active_passenger" ON "rides"  ("passenger_user_id") WHERE "status" IN ('SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_status_search_expires_at" ON "rides"  ("status", "search_expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_driver_status" ON "rides"  ("driver_profile_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_passenger_requested_at" ON "rides"  ("passenger_user_id", "requested_at") `,
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
      `ALTER TABLE "fare_quotes" ADD CONSTRAINT "FK_1dd09aaff48c4bf9147f4890100" FOREIGN KEY ("passenger_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" ADD CONSTRAINT "FK_92ce6f7fc1cfa6362b5d222b007" FOREIGN KEY ("fare_rule_id") REFERENCES "fare_rules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" ADD CONSTRAINT "FK_b222cd3e405afc9b44ba6f507b9" FOREIGN KEY ("origin_zone_id") REFERENCES "service_zones"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" ADD CONSTRAINT "FK_53a80bb58af4d7d0e92e2eb56e4" FOREIGN KEY ("destination_zone_id") REFERENCES "service_zones"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD CONSTRAINT "FK_3a98c5d7c95ccfd4c503f8e260b" FOREIGN KEY ("passenger_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD CONSTRAINT "FK_4d5c567a1389b55c9b9f1a64d3d" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD CONSTRAINT "FK_33804da5c8fa161c8a43298b0a0" FOREIGN KEY ("fare_quote_id") REFERENCES "fare_quotes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD CONSTRAINT "FK_dcece054579cd0ee4396e2008ab" FOREIGN KEY ("origin_zone_id") REFERENCES "service_zones"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD CONSTRAINT "FK_0e9c83b2328e2653aa7f4199fca" FOREIGN KEY ("destination_zone_id") REFERENCES "service_zones"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rides" DROP CONSTRAINT "FK_0e9c83b2328e2653aa7f4199fca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP CONSTRAINT "FK_dcece054579cd0ee4396e2008ab"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP CONSTRAINT "FK_33804da5c8fa161c8a43298b0a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP CONSTRAINT "FK_4d5c567a1389b55c9b9f1a64d3d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP CONSTRAINT "FK_3a98c5d7c95ccfd4c503f8e260b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" DROP CONSTRAINT "FK_53a80bb58af4d7d0e92e2eb56e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" DROP CONSTRAINT "FK_b222cd3e405afc9b44ba6f507b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" DROP CONSTRAINT "FK_92ce6f7fc1cfa6362b5d222b007"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_quotes" DROP CONSTRAINT "FK_1dd09aaff48c4bf9147f4890100"`,
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
      `DROP INDEX "public"."IDX_rides_passenger_requested_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_rides_driver_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rides_status_search_expires_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_rides_active_passenger"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rides_destination_position"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_rides_origin_position"`);
    await queryRunner.query(`DROP TABLE "rides"`);
    await queryRunner.query(
      `DROP TYPE "public"."ride_cancellation_actor_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ride_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fare_quotes_passenger_status_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fare_quotes_status_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fare_quotes_destination_position"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fare_quotes_origin_position"`,
    );
    await queryRunner.query(`DROP TABLE "fare_quotes"`);
    await queryRunner.query(`DROP TYPE "public"."fare_quote_status_enum"`);
  }
}
