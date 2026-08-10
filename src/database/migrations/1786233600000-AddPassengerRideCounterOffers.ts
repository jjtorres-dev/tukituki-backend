import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPassengerRideCounterOffers1786233600000 implements MigrationInterface {
  name = 'AddPassengerRideCounterOffers1786233600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * Este estado representa explícitamente el turno
     * del conductor después de una contraoferta
     * individual del pasajero.
     */
    await queryRunner.query(`
      ALTER TYPE "ride_offer_status_enum"
      ADD VALUE IF NOT EXISTS 'PASSENGER_COUNTERED' AFTER 'PROPOSED'
    `);

    /*
     * La contraoferta se guarda en RideOffer porque
     * cada negociación pasajero-conductor evoluciona
     * de forma independiente.
     *
     * La oferta inicial del viaje permanece inmutable
     * en rides.passenger_offer_fare.
     */
    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ADD COLUMN "passenger_proposed_fare"
      numeric(10,2)
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ADD COLUMN "passenger_proposed_at"
      timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ADD CONSTRAINT "CHK_ride_offers_passenger_proposed_fare_positive"
      CHECK (
        "passenger_proposed_fare" IS NULL
        OR "passenger_proposed_fare" > 0
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ADD CONSTRAINT "CHK_ride_offers_passenger_proposal_complete"
      CHECK (
        ("passenger_proposed_fare" IS NULL
          AND "passenger_proposed_at" IS NULL)
        OR
        ("passenger_proposed_fare" IS NOT NULL
          AND "passenger_proposed_at" IS NOT NULL)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Al volver a la versión anterior conservamos
     * la última propuesta del conductor visible
     * para el pasajero.
     */
    await queryRunner.query(`
      UPDATE "ride_offers"
      SET "status" = 'PROPOSED'
      WHERE "status" = 'PASSENGER_COUNTERED'
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      DROP CONSTRAINT IF EXISTS
      "CHK_ride_offers_passenger_proposal_complete"
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      DROP CONSTRAINT IF EXISTS
      "CHK_ride_offers_passenger_proposed_fare_positive"
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      DROP COLUMN IF EXISTS "passenger_proposed_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      DROP COLUMN IF EXISTS "passenger_proposed_fare"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_ride_offers_accepted_ride"
    `);

    await queryRunner.query(`
      ALTER TYPE "ride_offer_status_enum"
      RENAME TO "ride_offer_status_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "ride_offer_status_enum" AS ENUM (
        'OFFERED',
        'PROPOSED',
        'ACCEPTED',
        'REJECTED',
        'EXPIRED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ALTER COLUMN "status"
      DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ALTER COLUMN "status"
      TYPE "ride_offer_status_enum"
      USING "status"::text::"ride_offer_status_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ALTER COLUMN "status"
      SET DEFAULT 'OFFERED'
    `);

    await queryRunner.query(`
      DROP TYPE "ride_offer_status_enum_old"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX
      "UQ_ride_offers_accepted_ride"
      ON "ride_offers" ("ride_id")
      WHERE "status" = 'ACCEPTED'
    `);
  }
}
