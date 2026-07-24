import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformCommissions1784900000000 implements MigrationInterface {
  name = 'CreatePlatformCommissions1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum"
       ADD VALUE IF NOT EXISTS 'PLATFORM_COMMISSION_ACCRUED'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."commission_collection_mode_enum"
       AS ENUM('DRIVER_PAYABLE', 'DEDUCT_FROM_PAYOUT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ride_commission_status_enum"
       AS ENUM('ACCRUED', 'HELD', 'SETTLED', 'REVERSED')`,
    );

    await queryRunner.query(
      `CREATE TABLE "commission_policies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying(80) NOT NULL,
        "name" character varying(160) NOT NULL,
        "rate_bps" smallint NOT NULL,
        "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL,
        "effective_until" TIMESTAMP WITH TIME ZONE,
        "created_by_admin_user_id" uuid,
        "reason" character varying(500),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_commission_policies_rate"
          CHECK ("rate_bps" BETWEEN 300 AND 500),
        CONSTRAINT "CHK_commission_policies_effective_range"
          CHECK (
            "effective_until" IS NULL
            OR "effective_until" > "effective_from"
          ),
        CONSTRAINT "PK_commission_policies" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_commission_policies_code"
       ON "commission_policies" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_commission_policies_effective"
       ON "commission_policies" ("effective_from", "effective_until")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_commission_policies_open"
       ON "commission_policies" ((true))
       WHERE "effective_until" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "commission_policies"
       ADD CONSTRAINT "FK_commission_policies_created_by"
       FOREIGN KEY ("created_by_admin_user_id") REFERENCES "users"("id")
       ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "commission_policies" (
        "code", "name", "rate_bps", "effective_from", "reason"
      ) VALUES (
        'TUKITUKI_DEFAULT_500BPS',
        'Comisión TukiTuki 5.00%',
        500,
        now(),
        'Política inicial: margen base para operación de la plataforma'
      )`,
    );

    await queryRunner.query(
      `ALTER TABLE "rides"
       ADD "commission_policy_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides"
       ADD "platform_commission_rate_bps" smallint NOT NULL DEFAULT 500`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides"
       ADD CONSTRAINT "CHK_rides_platform_commission_rate"
       CHECK ("platform_commission_rate_bps" BETWEEN 300 AND 500)`,
    );
    await queryRunner.query(
      `UPDATE "rides"
       SET "commission_policy_id" = (
         SELECT "id" FROM "commission_policies"
         WHERE "code" = 'TUKITUKI_DEFAULT_500BPS'
       )
       WHERE "commission_policy_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_commission_policy_id"
       ON "rides" ("commission_policy_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides"
       ADD CONSTRAINT "FK_rides_commission_policy"
       FOREIGN KEY ("commission_policy_id")
       REFERENCES "commission_policies"("id")
       ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "ride_commissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ride_id" uuid NOT NULL,
        "payment_id" uuid NOT NULL,
        "driver_profile_id" uuid NOT NULL,
        "policy_id" uuid,
        "payment_method" "public"."payment_method_enum" NOT NULL,
        "collection_mode" "public"."commission_collection_mode_enum" NOT NULL,
        "status" "public"."ride_commission_status_enum"
          NOT NULL DEFAULT 'ACCRUED',
        "rate_bps" smallint NOT NULL,
        "base_amount" numeric(10,2) NOT NULL,
        "commission_amount" numeric(10,2) NOT NULL,
        "driver_net_amount" numeric(10,2) NOT NULL,
        "currency" character(3) NOT NULL,
        "accrued_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "held_at" TIMESTAMP WITH TIME ZONE,
        "settled_at" TIMESTAMP WITH TIME ZONE,
        "reversed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_ride_commissions_rate"
          CHECK ("rate_bps" BETWEEN 300 AND 500),
        CONSTRAINT "CHK_ride_commissions_amounts"
          CHECK (
            "base_amount" >= 0
            AND "commission_amount" >= 0
            AND "driver_net_amount" >= 0
            AND "base_amount" = "commission_amount" + "driver_net_amount"
          ),
        CONSTRAINT "PK_ride_commissions" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_commissions_ride"
       ON "ride_commissions" ("ride_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_commissions_payment"
       ON "ride_commissions" ("payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_commissions_driver_status_accrued"
       ON "ride_commissions" (
         "driver_profile_id", "status", "accrued_at"
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_commissions_status_accrued"
       ON "ride_commissions" ("status", "accrued_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       ADD CONSTRAINT "FK_ride_commissions_ride"
       FOREIGN KEY ("ride_id") REFERENCES "rides"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       ADD CONSTRAINT "FK_ride_commissions_payment"
       FOREIGN KEY ("payment_id") REFERENCES "ride_payments"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       ADD CONSTRAINT "FK_ride_commissions_driver"
       FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       ADD CONSTRAINT "FK_ride_commissions_policy"
       FOREIGN KEY ("policy_id") REFERENCES "commission_policies"("id")
       ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `INSERT INTO "ride_commissions" (
        "ride_id", "payment_id", "driver_profile_id", "policy_id",
        "payment_method", "collection_mode", "status", "rate_bps",
        "base_amount", "commission_amount", "driver_net_amount",
        "currency", "accrued_at"
      )
      SELECT
        payment."ride_id",
        payment."id",
        payment."driver_profile_id",
        ride."commission_policy_id",
        payment."method",
        CASE
          WHEN payment."method" = 'CASH'
            THEN 'DRIVER_PAYABLE'::commission_collection_mode_enum
          ELSE 'DEDUCT_FROM_PAYOUT'::commission_collection_mode_enum
        END,
        'ACCRUED'::ride_commission_status_enum,
        ride."platform_commission_rate_bps",
        payment."amount_due",
        ROUND(
          payment."amount_due" * ride."platform_commission_rate_bps" / 10000,
          2
        ),
        payment."amount_due" - ROUND(
          payment."amount_due" * ride."platform_commission_rate_bps" / 10000,
          2
        ),
        payment."currency",
        COALESCE(payment."confirmed_at", payment."updated_at")
      FROM "ride_payments" payment
      INNER JOIN "rides" ride ON ride."id" = payment."ride_id"
      WHERE payment."status" = 'PAID'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       DROP CONSTRAINT "FK_ride_commissions_policy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       DROP CONSTRAINT "FK_ride_commissions_driver"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       DROP CONSTRAINT "FK_ride_commissions_payment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       DROP CONSTRAINT "FK_ride_commissions_ride"`,
    );
    await queryRunner.query(`DROP TABLE "ride_commissions"`);

    await queryRunner.query(
      `ALTER TABLE "rides"
       DROP CONSTRAINT "FK_rides_commission_policy"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rides_commission_policy_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides"
       DROP CONSTRAINT "CHK_rides_platform_commission_rate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides"
       DROP COLUMN "platform_commission_rate_bps"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "commission_policy_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "commission_policies"
       DROP CONSTRAINT "FK_commission_policies_created_by"`,
    );
    await queryRunner.query(`DROP TABLE "commission_policies"`);
    await queryRunner.query(`DROP TYPE "public"."ride_commission_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."commission_collection_mode_enum"`,
    );

    // Los valores añadidos a enums compartidos permanecen tras revertir.
  }
}
