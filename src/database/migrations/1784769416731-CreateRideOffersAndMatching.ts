import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRideOffersAndMatching1784769416731 implements MigrationInterface {
  name = 'CreateRideOffersAndMatching1784769416731';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ride_offer_status_enum" AS ENUM('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "driver_profile_id" uuid NOT NULL, "status" "public"."ride_offer_status_enum" NOT NULL DEFAULT 'OFFERED', "distance_to_origin_meters" integer NOT NULL, "dispatch_round" smallint NOT NULL, "search_radius_meters" integer NOT NULL, "offered_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "responded_at" TIMESTAMP WITH TIME ZONE, "accepted_at" TIMESTAMP WITH TIME ZONE, "rejected_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" character varying(300), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8bd0ac2b8b108f575ceea9cb433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_offers_expires_at" ON "ride_offers"  ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_offers_ride_status" ON "ride_offers"  ("ride_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_offers_driver_status" ON "ride_offers"  ("driver_profile_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_offers_accepted_ride" ON "ride_offers"  ("ride_id") WHERE "status" = 'ACCEPTED'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_offers_ride_driver" ON "ride_offers"  ("ride_id", "driver_profile_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "dispatch_round" smallint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "last_dispatch_at" TIMESTAMP WITH TIME ZONE`,
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
      `CREATE UNIQUE INDEX "UQ_rides_active_driver" ON "rides"  ("driver_profile_id") WHERE "driver_profile_id" IS NOT NULL AND "status" IN ('DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS')`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_offers" ADD CONSTRAINT "FK_d6b5e4d357eb886d83951cd9359" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_offers" ADD CONSTRAINT "FK_785c3879f985d36688d26e55baa" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ride_offers" DROP CONSTRAINT "FK_785c3879f985d36688d26e55baa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_offers" DROP CONSTRAINT "FK_d6b5e4d357eb886d83951cd9359"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_rides_active_driver"`);
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
      `ALTER TABLE "rides" DROP COLUMN "last_dispatch_at"`,
    );
    await queryRunner.query(`ALTER TABLE "rides" DROP COLUMN "dispatch_round"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_ride_offers_ride_driver"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_ride_offers_accepted_ride"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_offers_driver_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_offers_ride_status"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_ride_offers_expires_at"`);
    await queryRunner.query(`DROP TABLE "ride_offers"`);
    await queryRunner.query(`DROP TYPE "public"."ride_offer_status_enum"`);
  }
}
