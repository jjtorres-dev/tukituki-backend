import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCashPayments1784880000000 implements MigrationInterface {
  name = 'CreateCashPayments1784880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of [
      'CASH_PAYMENT_CONFIRMED',
      'CASH_PAYMENT_DISPUTED',
      'CASH_PAYMENT_RESOLVED',
    ]) {
      await queryRunner.query(
        `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
    for (const value of [
      'CASH_PAYMENT_CONFIRMED',
      'CASH_PAYMENT_DISPUTED',
      'CASH_PAYMENT_RESOLVED',
    ]) {
      await queryRunner.query(
        `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }

    await queryRunner.query(
      `CREATE TYPE "public"."payment_method_enum" AS ENUM('CASH')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ride_payment_status_enum" AS ENUM('PENDING', 'PAID', 'DISPUTED', 'VOIDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cash_payment_dispute_reason_enum" AS ENUM('WRONG_AMOUNT', 'PAYMENT_NOT_MADE', 'CHANGE_NOT_RETURNED', 'OTHER')`,
    );

    await queryRunner.query(
      `ALTER TABLE "rides"
       ADD "payment_method" "public"."payment_method_enum"
       NOT NULL DEFAULT 'CASH'`,
    );

    await queryRunner.query(
      `CREATE TABLE "ride_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ride_id" uuid NOT NULL,
        "passenger_user_id" uuid NOT NULL,
        "driver_profile_id" uuid NOT NULL,
        "method" "public"."payment_method_enum" NOT NULL,
        "status" "public"."ride_payment_status_enum" NOT NULL DEFAULT 'PENDING',
        "amount_due" numeric(10,2) NOT NULL,
        "cash_received" numeric(10,2),
        "change_given" numeric(10,2),
        "currency" character(3) NOT NULL,
        "confirmed_by_driver_user_id" uuid,
        "confirmed_at" TIMESTAMP WITH TIME ZONE,
        "confirmation_notes" character varying(500),
        "dispute_reason" "public"."cash_payment_dispute_reason_enum",
        "dispute_detail" character varying(500),
        "disputed_at" TIMESTAMP WITH TIME ZONE,
        "resolved_by_admin_user_id" uuid,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "resolution_notes" character varying(1000),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_ride_payments_amounts" CHECK (
          "amount_due" >= 0 AND
          ("cash_received" IS NULL OR "cash_received" >= 0) AND
          ("change_given" IS NULL OR "change_given" >= 0)
        ),
        CONSTRAINT "CHK_ride_payments_cash_totals" CHECK (
          "cash_received" IS NULL OR "cash_received" >= "amount_due"
        ),
        CONSTRAINT "PK_ride_payments" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_payments_ride_id"
       ON "ride_payments" ("ride_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_payments_status_created"
       ON "ride_payments" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_payments_passenger_status"
       ON "ride_payments" ("passenger_user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_payments_driver_status"
       ON "ride_payments" ("driver_profile_id", "status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       ADD CONSTRAINT "FK_ride_payments_ride"
       FOREIGN KEY ("ride_id") REFERENCES "rides"("id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       ADD CONSTRAINT "FK_ride_payments_passenger"
       FOREIGN KEY ("passenger_user_id") REFERENCES "users"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       ADD CONSTRAINT "FK_ride_payments_driver"
       FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       ADD CONSTRAINT "FK_ride_payments_confirmed_by"
       FOREIGN KEY ("confirmed_by_driver_user_id") REFERENCES "users"("id")
       ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       ADD CONSTRAINT "FK_ride_payments_resolved_by"
       FOREIGN KEY ("resolved_by_admin_user_id") REFERENCES "users"("id")
       ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `INSERT INTO "ride_payments" (
         "ride_id", "passenger_user_id", "driver_profile_id", "method",
         "status", "amount_due", "currency", "created_at", "updated_at"
       )
       SELECT
         ride.id, ride.passenger_user_id, ride.driver_profile_id,
         ride.payment_method, 'PENDING', ride.final_fare, ride.currency,
         COALESCE(ride.completed_at, now()), now()
       FROM rides ride
       WHERE ride.status = 'COMPLETED'
         AND ride.driver_profile_id IS NOT NULL
         AND ride.final_fare IS NOT NULL
       ON CONFLICT ("ride_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       DROP CONSTRAINT "FK_ride_payments_resolved_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       DROP CONSTRAINT "FK_ride_payments_confirmed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       DROP CONSTRAINT "FK_ride_payments_driver"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       DROP CONSTRAINT "FK_ride_payments_passenger"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       DROP CONSTRAINT "FK_ride_payments_ride"`,
    );
    await queryRunner.query(`DROP TABLE "ride_payments"`);
    await queryRunner.query(`ALTER TABLE "rides" DROP COLUMN "payment_method"`);
    await queryRunner.query(
      `DROP TYPE "public"."cash_payment_dispute_reason_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ride_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payment_method_enum"`);

    // Los valores añadidos a enums compartidos permanecen tras revertir.
  }
}
