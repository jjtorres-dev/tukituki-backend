import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverSettlements1784910000000 implements MigrationInterface {
  name = 'CreateDriverSettlements1784910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."ride_commission_status_enum"
       ADD VALUE IF NOT EXISTS 'ALLOCATED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum"
       ADD VALUE IF NOT EXISTS 'DRIVER_SETTLEMENT_APPROVED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum"
       ADD VALUE IF NOT EXISTS 'DRIVER_SETTLEMENT_SETTLED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum"
       ADD VALUE IF NOT EXISTS 'DRIVER_SETTLEMENT_CANCELLED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum"
       ADD VALUE IF NOT EXISTS 'DRIVER_SETTLEMENT_APPROVED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum"
       ADD VALUE IF NOT EXISTS 'DRIVER_SETTLEMENT_SETTLED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum"
       ADD VALUE IF NOT EXISTS 'DRIVER_SETTLEMENT_CANCELLED'`,
    );

    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       ADD "eligible_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "ride_commissions"
       SET "eligible_at" = "accrued_at" + INTERVAL '24 hours'
       WHERE "eligible_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       ALTER COLUMN "eligible_at" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_commissions_settlement_eligibility"
       ON "ride_commissions" (
         "driver_profile_id", "status", "currency", "eligible_at"
       )`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."driver_settlement_status_enum"
       AS ENUM('DRAFT', 'APPROVED', 'SETTLED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."driver_settlement_direction_enum"
       AS ENUM('PLATFORM_TO_DRIVER', 'DRIVER_TO_PLATFORM', 'BALANCED')`,
    );

    await queryRunner.query(
      `CREATE TABLE "driver_settlements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "driver_profile_id" uuid NOT NULL,
        "idempotency_key" character varying(100) NOT NULL,
        "period_start" TIMESTAMP WITH TIME ZONE NOT NULL,
        "period_end" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "public"."driver_settlement_status_enum"
          NOT NULL DEFAULT 'DRAFT',
        "direction" "public"."driver_settlement_direction_enum" NOT NULL,
        "currency" character(3) NOT NULL,
        "ride_count" integer NOT NULL,
        "gross_fare_amount" numeric(14,2) NOT NULL,
        "platform_commission_amount" numeric(14,2) NOT NULL,
        "digital_net_amount" numeric(14,2) NOT NULL,
        "cash_commission_amount" numeric(14,2) NOT NULL,
        "settlement_amount" numeric(14,2) NOT NULL,
        "created_by_admin_user_id" uuid NOT NULL,
        "approved_by_admin_user_id" uuid,
        "settled_by_admin_user_id" uuid,
        "cancelled_by_admin_user_id" uuid,
        "transfer_reference" character varying(120),
        "notes" character varying(1000),
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "settled_at" TIMESTAMP WITH TIME ZONE,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_driver_settlements_period"
          CHECK ("period_end" > "period_start"),
        CONSTRAINT "CHK_driver_settlements_amounts"
          CHECK (
            "ride_count" > 0
            AND "gross_fare_amount" >= 0
            AND "platform_commission_amount" >= 0
            AND "digital_net_amount" >= 0
            AND "cash_commission_amount" >= 0
            AND "settlement_amount" >= 0
          ),
        CONSTRAINT "CHK_driver_settlements_direction"
          CHECK (
            (
              "direction" = 'PLATFORM_TO_DRIVER'
              AND "digital_net_amount" > "cash_commission_amount"
              AND "settlement_amount" =
                "digital_net_amount" - "cash_commission_amount"
            ) OR (
              "direction" = 'DRIVER_TO_PLATFORM'
              AND "cash_commission_amount" > "digital_net_amount"
              AND "settlement_amount" =
                "cash_commission_amount" - "digital_net_amount"
            ) OR (
              "direction" = 'BALANCED'
              AND "digital_net_amount" = "cash_commission_amount"
              AND "settlement_amount" = 0
            )
          ),
        CONSTRAINT "CHK_driver_settlements_lifecycle"
          CHECK (
            (
              "status" = 'DRAFT'
              AND "approved_at" IS NULL
              AND "settled_at" IS NULL
              AND "cancelled_at" IS NULL
            ) OR (
              "status" = 'APPROVED'
              AND "approved_at" IS NOT NULL
              AND "settled_at" IS NULL
              AND "cancelled_at" IS NULL
            ) OR (
              "status" = 'SETTLED'
              AND "approved_at" IS NOT NULL
              AND "settled_at" IS NOT NULL
              AND "cancelled_at" IS NULL
            ) OR (
              "status" = 'CANCELLED'
              AND "cancelled_at" IS NOT NULL
              AND "settled_at" IS NULL
            )
          ),
        CONSTRAINT "PK_driver_settlements" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_settlements_idempotency_key"
       ON "driver_settlements" ("idempotency_key")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_settlements_transfer_reference"
       ON "driver_settlements" ("transfer_reference")
       WHERE "transfer_reference" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_settlements_active_driver_currency"
       ON "driver_settlements" ("driver_profile_id", "currency")
       WHERE "status" IN ('DRAFT', 'APPROVED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_settlements_driver_created"
       ON "driver_settlements" ("driver_profile_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_settlements_status_created"
       ON "driver_settlements" ("status", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       ADD CONSTRAINT "FK_driver_settlements_driver"
       FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    for (const [column, constraint] of [
      ['created_by_admin_user_id', 'FK_driver_settlements_created_by'],
      ['approved_by_admin_user_id', 'FK_driver_settlements_approved_by'],
      ['settled_by_admin_user_id', 'FK_driver_settlements_settled_by'],
      ['cancelled_by_admin_user_id', 'FK_driver_settlements_cancelled_by'],
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE "driver_settlements"
         ADD CONSTRAINT "${constraint}"
         FOREIGN KEY ("${column}") REFERENCES "users"("id")
         ON DELETE ${column === 'created_by_admin_user_id' ? 'RESTRICT' : 'SET NULL'}
         ON UPDATE NO ACTION`,
      );
    }

    await queryRunner.query(
      `CREATE TABLE "driver_settlement_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "settlement_id" uuid NOT NULL,
        "commission_id" uuid NOT NULL,
        "ride_id" uuid NOT NULL,
        "collection_mode" "public"."commission_collection_mode_enum"
          NOT NULL,
        "base_amount" numeric(10,2) NOT NULL,
        "commission_amount" numeric(10,2) NOT NULL,
        "driver_net_amount" numeric(10,2) NOT NULL,
        "net_effect_amount" numeric(10,2) NOT NULL,
        "currency" character(3) NOT NULL,
        "accrued_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "released_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_driver_settlement_items_amounts"
          CHECK (
            "base_amount" >= 0
            AND "commission_amount" >= 0
            AND "driver_net_amount" >= 0
          ),
        CONSTRAINT "CHK_driver_settlement_items_effect"
          CHECK (
            (
              "collection_mode" = 'DEDUCT_FROM_PAYOUT'
              AND "net_effect_amount" = "driver_net_amount"
            ) OR (
              "collection_mode" = 'DRIVER_PAYABLE'
              AND "net_effect_amount" = -"commission_amount"
            )
          ),
        CONSTRAINT "PK_driver_settlement_items" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_settlement_items_settlement"
       ON "driver_settlement_items" ("settlement_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_settlement_items_active_commission"
       ON "driver_settlement_items" ("commission_id")
       WHERE "released_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       ADD CONSTRAINT "FK_driver_settlement_items_settlement"
       FOREIGN KEY ("settlement_id") REFERENCES "driver_settlements"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       ADD CONSTRAINT "FK_driver_settlement_items_commission"
       FOREIGN KEY ("commission_id") REFERENCES "ride_commissions"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       DROP CONSTRAINT "FK_driver_settlement_items_commission"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       DROP CONSTRAINT "FK_driver_settlement_items_settlement"`,
    );
    await queryRunner.query(`DROP TABLE "driver_settlement_items"`);

    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       DROP CONSTRAINT "FK_driver_settlements_cancelled_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       DROP CONSTRAINT "FK_driver_settlements_settled_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       DROP CONSTRAINT "FK_driver_settlements_approved_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       DROP CONSTRAINT "FK_driver_settlements_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       DROP CONSTRAINT "FK_driver_settlements_driver"`,
    );
    await queryRunner.query(`DROP TABLE "driver_settlements"`);
    await queryRunner.query(
      `DROP TYPE "public"."driver_settlement_direction_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."driver_settlement_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_commissions_settlement_eligibility"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions" DROP COLUMN "eligible_at"`,
    );

    // Los valores agregados a enums compartidos permanecen tras revertir.
  }
}
