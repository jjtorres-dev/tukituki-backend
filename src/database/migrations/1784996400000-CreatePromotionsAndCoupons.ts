import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePromotionsAndCoupons1784996400000 implements MigrationInterface {
  name = 'CreatePromotionsAndCoupons1784996400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."promotion_discount_type_enum"
       AS ENUM('PERCENTAGE', 'FIXED_AMOUNT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."promotion_status_enum"
       AS ENUM('ACTIVE', 'PAUSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."promotion_redemption_status_enum"
       AS ENUM('RESERVED', 'APPLIED', 'RELEASED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "promotions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying(30) NOT NULL,
        "name" character varying(120) NOT NULL,
        "description" character varying(500),
        "discount_type" "public"."promotion_discount_type_enum" NOT NULL,
        "discount_bps" smallint,
        "fixed_amount" numeric(10,2),
        "maximum_discount_amount" numeric(10,2),
        "minimum_fare_amount" numeric(10,2) NOT NULL DEFAULT 0,
        "currency" character(3) NOT NULL DEFAULT 'PEN',
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "total_usage_limit" integer,
        "per_passenger_limit" smallint NOT NULL DEFAULT 1,
        "first_ride_only" boolean NOT NULL DEFAULT false,
        "status" "public"."promotion_status_enum" NOT NULL DEFAULT 'PAUSED',
        "created_by_admin_user_id" uuid NOT NULL,
        "updated_by_admin_user_id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_promotions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_promotions_period" CHECK ("ends_at" > "starts_at"),
        CONSTRAINT "CHK_promotions_discount" CHECK (
          ("discount_type" = 'PERCENTAGE'
            AND "discount_bps" BETWEEN 1 AND 10000
            AND "fixed_amount" IS NULL)
          OR
          ("discount_type" = 'FIXED_AMOUNT'
            AND "fixed_amount" > 0
            AND "discount_bps" IS NULL)
        ),
        CONSTRAINT "CHK_promotions_limits" CHECK (
          "minimum_fare_amount" >= 0
          AND ("maximum_discount_amount" IS NULL
            OR "maximum_discount_amount" > 0)
          AND ("total_usage_limit" IS NULL OR "total_usage_limit" > 0)
          AND "per_passenger_limit" > 0
        )
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_promotions_code" ON "promotions" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_promotions_status_period"
       ON "promotions" ("status", "starts_at", "ends_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions"
       ADD CONSTRAINT "FK_promotions_created_by"
       FOREIGN KEY ("created_by_admin_user_id") REFERENCES "users"("id")
       ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions"
       ADD CONSTRAINT "FK_promotions_updated_by"
       FOREIGN KEY ("updated_by_admin_user_id") REFERENCES "users"("id")
       ON DELETE RESTRICT`,
    );

    await queryRunner.query(
      `ALTER TABLE "rides"
       ADD "promotion_code" character varying(30),
       ADD "estimated_discount" numeric(10,2) NOT NULL DEFAULT 0,
       ADD "estimated_passenger_fare" numeric(10,2),
       ADD "final_discount" numeric(10,2),
       ADD "passenger_amount_due" numeric(10,2)`,
    );
    await queryRunner.query(
      `UPDATE "rides"
       SET "estimated_passenger_fare" = "estimated_fare"
       WHERE "estimated_passenger_fare" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides"
       ALTER COLUMN "estimated_passenger_fare" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides"
       ADD CONSTRAINT "CHK_rides_promotion_amounts" CHECK (
         "estimated_discount" >= 0
         AND "estimated_passenger_fare" =
           "estimated_fare" - "estimated_discount"
         AND ("final_discount" IS NULL OR "final_discount" >= 0)
         AND ("passenger_amount_due" IS NULL
           OR "passenger_amount_due" = "final_fare" - "final_discount")
       )`,
    );

    await queryRunner.query(
      `CREATE TABLE "promotion_redemptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "promotion_id" uuid NOT NULL,
        "passenger_user_id" uuid NOT NULL,
        "ride_id" uuid NOT NULL,
        "code_snapshot" character varying(30) NOT NULL,
        "discount_type" "public"."promotion_discount_type_enum" NOT NULL,
        "discount_bps" smallint,
        "fixed_amount" numeric(10,2),
        "maximum_discount_amount" numeric(10,2),
        "estimated_fare" numeric(10,2) NOT NULL,
        "estimated_discount" numeric(10,2) NOT NULL,
        "final_fare" numeric(10,2),
        "final_discount" numeric(10,2),
        "currency" character(3) NOT NULL,
        "status" "public"."promotion_redemption_status_enum"
          NOT NULL DEFAULT 'RESERVED',
        "reserved_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "applied_at" TIMESTAMP WITH TIME ZONE,
        "released_at" TIMESTAMP WITH TIME ZONE,
        "release_reason" character varying(200),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_promotion_redemptions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_promotion_redemptions_amounts" CHECK (
          "estimated_fare" >= 0 AND "estimated_discount" >= 0
          AND ("final_fare" IS NULL OR "final_fare" >= 0)
          AND ("final_discount" IS NULL OR "final_discount" >= 0)
        )
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_promotion_redemptions_ride"
       ON "promotion_redemptions" ("ride_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_promotion_redemptions_promotion_status"
       ON "promotion_redemptions" ("promotion_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_promotion_redemptions_passenger_status"
       ON "promotion_redemptions" ("passenger_user_id", "status")`,
    );
    for (const [name, column, table, target] of [
      [
        'FK_promotion_redemptions_promotion',
        'promotion_id',
        'promotions',
        'id',
      ],
      [
        'FK_promotion_redemptions_passenger',
        'passenger_user_id',
        'users',
        'id',
      ],
      ['FK_promotion_redemptions_ride', 'ride_id', 'rides', 'id'],
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE "promotion_redemptions"
         ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}")
         REFERENCES "${table}"("${target}") ON DELETE RESTRICT`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       ADD "gross_amount" numeric(10,2),
       ADD "discount_amount" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE "ride_payments" SET "gross_amount" = "amount_due"
       WHERE "gross_amount" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       ALTER COLUMN "gross_amount" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       DROP CONSTRAINT "CHK_ride_payments_amounts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       ADD CONSTRAINT "CHK_ride_payments_amounts" CHECK (
         "gross_amount" >= 0 AND "discount_amount" >= 0
         AND "gross_amount" = "amount_due" + "discount_amount"
         AND "amount_due" >= 0
         AND ("cash_received" IS NULL OR "cash_received" >= 0)
         AND ("change_given" IS NULL OR "change_given" >= 0)
       )`,
    );

    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       ADD "promotion_credit_amount" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       DROP CONSTRAINT "CHK_ride_commissions_amounts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       ADD CONSTRAINT "CHK_ride_commissions_amounts" CHECK (
         "base_amount" >= 0 AND "commission_amount" >= 0
         AND "driver_net_amount" >= 0 AND "promotion_credit_amount" >= 0
         AND "base_amount" = "commission_amount" + "driver_net_amount"
       )`,
    );

    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       ADD "promotion_credit_amount" numeric(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       ADD "promotion_credit_amount" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       DROP CONSTRAINT "CHK_driver_settlements_direction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       ADD CONSTRAINT "CHK_driver_settlements_direction" CHECK (
         ("direction" = 'PLATFORM_TO_DRIVER'
          AND "digital_net_amount" + "promotion_credit_amount"
            > "cash_commission_amount"
          AND "settlement_amount" =
            "digital_net_amount" + "promotion_credit_amount"
              - "cash_commission_amount")
         OR ("direction" = 'DRIVER_TO_PLATFORM'
          AND "cash_commission_amount"
            > "digital_net_amount" + "promotion_credit_amount"
          AND "settlement_amount" =
            "cash_commission_amount" - "digital_net_amount"
              - "promotion_credit_amount")
         OR ("direction" = 'BALANCED'
          AND "digital_net_amount" + "promotion_credit_amount"
            = "cash_commission_amount"
          AND "settlement_amount" = 0)
       )`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       DROP CONSTRAINT "CHK_driver_settlement_items_effect"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       ADD CONSTRAINT "CHK_driver_settlement_items_effect" CHECK (
         ("collection_mode" = 'DEDUCT_FROM_PAYOUT'
          AND "net_effect_amount" = "driver_net_amount")
         OR ("collection_mode" = 'DRIVER_PAYABLE'
          AND "net_effect_amount" =
            "promotion_credit_amount" - "commission_amount")
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       DROP CONSTRAINT "CHK_driver_settlement_items_effect"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       ADD CONSTRAINT "CHK_driver_settlement_items_effect" CHECK (
         ("collection_mode" = 'DEDUCT_FROM_PAYOUT'
          AND "net_effect_amount" = "driver_net_amount")
         OR ("collection_mode" = 'DRIVER_PAYABLE'
          AND "net_effect_amount" = -"commission_amount")
       )`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       DROP CONSTRAINT "CHK_driver_settlements_direction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       ADD CONSTRAINT "CHK_driver_settlements_direction" CHECK (
         ("direction" = 'PLATFORM_TO_DRIVER'
          AND "digital_net_amount" > "cash_commission_amount"
          AND "settlement_amount" =
            "digital_net_amount" - "cash_commission_amount")
         OR ("direction" = 'DRIVER_TO_PLATFORM'
          AND "cash_commission_amount" > "digital_net_amount"
          AND "settlement_amount" =
            "cash_commission_amount" - "digital_net_amount")
         OR ("direction" = 'BALANCED'
          AND "digital_net_amount" = "cash_commission_amount"
          AND "settlement_amount" = 0)
       )`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlement_items"
       DROP COLUMN "promotion_credit_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_settlements"
       DROP COLUMN "promotion_credit_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       DROP CONSTRAINT "CHK_ride_commissions_amounts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       DROP COLUMN "promotion_credit_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_commissions"
       ADD CONSTRAINT "CHK_ride_commissions_amounts" CHECK (
         "base_amount" >= 0 AND "commission_amount" >= 0
         AND "driver_net_amount" >= 0
         AND "base_amount" = "commission_amount" + "driver_net_amount"
       )`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       DROP CONSTRAINT "CHK_ride_payments_amounts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       DROP COLUMN "discount_amount", DROP COLUMN "gross_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_payments"
       ADD CONSTRAINT "CHK_ride_payments_amounts" CHECK (
         "amount_due" >= 0
         AND ("cash_received" IS NULL OR "cash_received" >= 0)
         AND ("change_given" IS NULL OR "change_given" >= 0)
       )`,
    );
    await queryRunner.query(`DROP TABLE "promotion_redemptions"`);
    await queryRunner.query(
      `ALTER TABLE "rides" DROP CONSTRAINT "CHK_rides_promotion_amounts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides"
       DROP COLUMN "passenger_amount_due",
       DROP COLUMN "final_discount",
       DROP COLUMN "estimated_passenger_fare",
       DROP COLUMN "estimated_discount",
       DROP COLUMN "promotion_code"`,
    );
    await queryRunner.query(`DROP TABLE "promotions"`);
    await queryRunner.query(
      `DROP TYPE "public"."promotion_redemption_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."promotion_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."promotion_discount_type_enum"`,
    );
  }
}
