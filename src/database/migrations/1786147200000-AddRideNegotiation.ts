import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRideNegotiation1786147200000 implements MigrationInterface {
  name = 'AddRideNegotiation1786147200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * Una oferta PROPOSED significa que el conductor
     * respondió al pasajero:
     *
     * - aceptando exactamente su precio; o
     * - enviando una contraoferta.
     *
     * ACCEPTED se reservará para cuando el pasajero
     * elija finalmente a ese conductor.
     */
    await queryRunner.query(`
      ALTER TYPE "ride_offer_status_enum"
      ADD VALUE IF NOT EXISTS 'PROPOSED' AFTER 'OFFERED'
    `);

    /*
     * Precio que el pasajero decidió ofrecer
     * al momento de solicitar el viaje.
     *
     * Se permite NULL para conservar compatibilidad
     * con viajes históricos ya existentes.
     */
    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD COLUMN "passenger_offer_fare"
      numeric(10,2)
    `);

    /*
     * Precio negociado definitivo.
     *
     * Permanece NULL mientras el pasajero
     * todavía no haya elegido conductor.
     */
    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD COLUMN "agreed_fare"
      numeric(10,2)
    `);

    /*
     * Precio presentado por cada conductor.
     *
     * Si acepta el precio del pasajero,
     * proposed_fare será igual a passenger_offer_fare.
     *
     * Si contraoferta, contendrá el nuevo importe.
     */
    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ADD COLUMN "proposed_fare"
      numeric(10,2)
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ADD COLUMN "proposed_at"
      timestamptz
    `);

    /*
     * Ningún precio negociable puede ser
     * cero ni negativo.
     *
     * NULL continúa permitido para registros
     * históricos y ofertas todavía no respondidas.
     */
    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD CONSTRAINT "CHK_rides_passenger_offer_fare_positive"
      CHECK (
        "passenger_offer_fare" IS NULL
        OR "passenger_offer_fare" > 0
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD CONSTRAINT "CHK_rides_agreed_fare_positive"
      CHECK (
        "agreed_fare" IS NULL
        OR "agreed_fare" > 0
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "ride_offers"
      ADD CONSTRAINT "CHK_ride_offers_proposed_fare_positive"
      CHECK (
        "proposed_fare" IS NULL
        OR "proposed_fare" > 0
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Si existen propuestas, las devolvemos
     * a OFFERED antes de retirar PROPOSED.
     */
    await queryRunner.query(`
    UPDATE "ride_offers"
    SET "status" = 'OFFERED'
    WHERE "status" = 'PROPOSED'
  `);

    await queryRunner.query(`
    ALTER TABLE "ride_offers"
    DROP CONSTRAINT IF EXISTS
    "CHK_ride_offers_proposed_fare_positive"
  `);

    await queryRunner.query(`
    ALTER TABLE "rides"
    DROP CONSTRAINT IF EXISTS
    "CHK_rides_agreed_fare_positive"
  `);

    await queryRunner.query(`
    ALTER TABLE "rides"
    DROP CONSTRAINT IF EXISTS
    "CHK_rides_passenger_offer_fare_positive"
  `);

    await queryRunner.query(`
    ALTER TABLE "ride_offers"
    DROP COLUMN IF EXISTS "proposed_at"
  `);

    await queryRunner.query(`
    ALTER TABLE "ride_offers"
    DROP COLUMN IF EXISTS "proposed_fare"
  `);

    await queryRunner.query(`
    ALTER TABLE "rides"
    DROP COLUMN IF EXISTS "agreed_fare"
  `);

    await queryRunner.query(`
    ALTER TABLE "rides"
    DROP COLUMN IF EXISTS "passenger_offer_fare"
  `);

    /*
     * Este índice parcial contiene:
     *
     * WHERE status = 'ACCEPTED'
     *
     * y depende directamente del enum actual.
     * Debemos retirarlo antes de reemplazar
     * ride_offer_status_enum.
     */
    await queryRunner.query(`
    DROP INDEX IF EXISTS
    "UQ_ride_offers_accepted_ride"
  `);

    /*
     * PostgreSQL no permite eliminar un valor
     * individual de un enum.
     *
     * Recreamos el enum sin PROPOSED.
     */
    await queryRunner.query(`
    ALTER TYPE "ride_offer_status_enum"
    RENAME TO "ride_offer_status_enum_old"
  `);

    await queryRunner.query(`
    CREATE TYPE "ride_offer_status_enum" AS ENUM (
      'OFFERED',
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

    /*
     * Restauramos el índice parcial original.
     *
     * Garantiza que solamente pueda existir
     * una oferta ACCEPTED por viaje.
     */
    await queryRunner.query(`
    CREATE UNIQUE INDEX
    "UQ_ride_offers_accepted_ride"
    ON "ride_offers" ("ride_id")
    WHERE "status" = 'ACCEPTED'
  `);
  }
}
