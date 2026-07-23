import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdvancedCancellationsAndNoShow1784850000000 implements MigrationInterface {
  name = 'CreateAdvancedCancellationsAndNoShow1784850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS 'PASSENGER_WAITING_STARTED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS 'RIDE_CANCELLED_BY_PASSENGER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS 'RIDE_CANCELLED_BY_DRIVER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS 'PASSENGER_NO_SHOW_CONFIRMED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS 'DRIVER_NO_SHOW_CONFIRMED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS 'CANCELLATION_FEE_CREATED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS 'CANCELLATION_FEE_WAIVED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS 'DRIVER_RELEASED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS 'RIDE_REMATCH_REQUESTED'`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'PASSENGER_WAITING'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'CANCELLATION_FEE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'CANCELLATION_FEE_WAIVED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'PASSENGER_NO_SHOW'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'DRIVER_NO_SHOW'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'RIDE_REMATCHED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS 'DRIVER_RELEASED'`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."ride_cancellation_type_enum" AS ENUM('PASSENGER_CANCELLED', 'DRIVER_CANCELLED', 'PASSENGER_NO_SHOW', 'DRIVER_NO_SHOW_CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cancellation_fee_status_enum" AS ENUM('NOT_APPLICABLE', 'PENDING', 'WAIVED', 'PAID', 'FAILED', 'REFUNDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."financial_obligation_type_enum" AS ENUM('PASSENGER_CANCELLATION_FEE', 'PASSENGER_NO_SHOW_FEE', 'DRIVER_COMPENSATION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."financial_obligation_status_enum" AS ENUM('PENDING', 'WAIVED', 'PAID', 'REFUNDED', 'CANCELLED')`,
    );

    await queryRunner.query(
      `CREATE TABLE "cancellation_policies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying(80) NOT NULL,
        "name" character varying(160) NOT NULL,
        "currency" character(3) NOT NULL DEFAULT 'PEN',
        "passenger_grace_period_seconds" integer NOT NULL,
        "passenger_assigned_fee" numeric(10,2) NOT NULL,
        "passenger_arriving_fee" numeric(10,2) NOT NULL,
        "passenger_arrived_fee" numeric(10,2) NOT NULL,
        "passenger_no_show_fee" numeric(10,2) NOT NULL,
        "driver_no_show_compensation" numeric(10,2) NOT NULL,
        "driver_arrival_wait_seconds" integer NOT NULL,
        "driver_no_progress_seconds" integer NOT NULL,
        "driver_no_progress_min_meters" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL,
        "effective_until" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_cancellation_policies_amounts" CHECK (
          "passenger_assigned_fee" >= 0 AND
          "passenger_arriving_fee" >= 0 AND
          "passenger_arrived_fee" >= 0 AND
          "passenger_no_show_fee" >= 0 AND
          "driver_no_show_compensation" >= 0
        ),
        CONSTRAINT "CHK_cancellation_policies_seconds" CHECK (
          "passenger_grace_period_seconds" >= 0 AND
          "driver_arrival_wait_seconds" > 0 AND
          "driver_no_progress_seconds" > 0 AND
          "driver_no_progress_min_meters" >= 0
        ),
        CONSTRAINT "CHK_cancellation_policies_effective_range" CHECK (
          "effective_until" IS NULL OR "effective_until" > "effective_from"
        ),
        CONSTRAINT "PK_cancellation_policies" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_cancellation_policies_code" ON "cancellation_policies" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cancellation_policies_active_effective" ON "cancellation_policies" ("is_active", "effective_from", "effective_until")`,
    );
    await queryRunner.query(
      `INSERT INTO "cancellation_policies" (
        "code", "name", "currency", "passenger_grace_period_seconds",
        "passenger_assigned_fee", "passenger_arriving_fee", "passenger_arrived_fee",
        "passenger_no_show_fee", "driver_no_show_compensation",
        "driver_arrival_wait_seconds", "driver_no_progress_seconds",
        "driver_no_progress_min_meters", "is_active", "effective_from"
      ) VALUES (
        'TARAPOTO_DEFAULT_2026', 'Política inicial Tarapoto', 'PEN', 60,
        '1.00', '1.50', '2.00', '2.50', '1.50', 300, 180, 100, true, now()
      )`,
    );

    await queryRunner.query(
      `ALTER TABLE "rides" ADD "cancellation_policy_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "cancellation_grace_period_seconds" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "cancellation_assigned_fee" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "cancellation_arriving_fee" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "cancellation_arrived_fee" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "passenger_no_show_fee" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "driver_no_show_compensation" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "driver_arrival_wait_seconds" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "driver_no_progress_seconds" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD "driver_no_progress_min_meters" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_cancellation_policy_id" ON "rides" ("cancellation_policy_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD CONSTRAINT "FK_rides_cancellation_policy" FOREIGN KEY ("cancellation_policy_id") REFERENCES "cancellation_policies"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `UPDATE "rides" SET
        "cancellation_policy_id" = (SELECT "id" FROM "cancellation_policies" WHERE "code" = 'TARAPOTO_DEFAULT_2026'),
        "cancellation_grace_period_seconds" = 60,
        "cancellation_assigned_fee" = '1.00',
        "cancellation_arriving_fee" = '1.50',
        "cancellation_arrived_fee" = '2.00',
        "passenger_no_show_fee" = '2.50',
        "driver_no_show_compensation" = '1.50',
        "driver_arrival_wait_seconds" = 300,
        "driver_no_progress_seconds" = 180,
        "driver_no_progress_min_meters" = 100
      WHERE "cancellation_policy_id" IS NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "ride_cancellations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ride_id" uuid NOT NULL,
        "actor_type" "public"."ride_cancellation_actor_enum" NOT NULL,
        "actor_user_id" uuid,
        "reason_code" character varying(80) NOT NULL,
        "reason_detail" character varying(500),
        "ride_status_before" "public"."ride_status_enum" NOT NULL,
        "cancellation_type" "public"."ride_cancellation_type_enum" NOT NULL,
        "calculated_fee" numeric(10,2) NOT NULL DEFAULT '0.00',
        "charged_fee" numeric(10,2) NOT NULL DEFAULT '0.00',
        "waived_amount" numeric(10,2) NOT NULL DEFAULT '0.00',
        "currency" character(3) NOT NULL,
        "fee_status" "public"."cancellation_fee_status_enum" NOT NULL DEFAULT 'NOT_APPLICABLE',
        "distance_to_reference_meters" numeric(10,2),
        "waiting_seconds" integer,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_ride_cancellations_fees" CHECK ("calculated_fee" >= 0 AND "charged_fee" >= 0 AND "waived_amount" >= 0),
        CONSTRAINT "PK_ride_cancellations" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_cancellations_ride_id" ON "ride_cancellations" ("ride_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_cancellations_actor_created_at" ON "ride_cancellations" ("actor_type", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_cancellations_fee_status_created_at" ON "ride_cancellations" ("fee_status", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_cancellations" ADD CONSTRAINT "FK_ride_cancellations_ride" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_cancellations" ADD CONSTRAINT "FK_ride_cancellations_actor_user" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "ride_waitings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ride_id" uuid NOT NULL,
        "started_by_driver_user_id" uuid NOT NULL,
        "waiting_started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "no_show_available_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "required_waiting_seconds" integer NOT NULL,
        "start_distance_meters" numeric(10,2) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ride_waitings" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_waitings_ride_id" ON "ride_waitings" ("ride_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_waitings_no_show_available_at" ON "ride_waitings" ("no_show_available_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_waitings" ADD CONSTRAINT "FK_ride_waitings_ride" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_waitings" ADD CONSTRAINT "FK_ride_waitings_driver_user" FOREIGN KEY ("started_by_driver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "user_financial_obligations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "ride_id" uuid NOT NULL,
        "cancellation_id" uuid,
        "obligation_type" "public"."financial_obligation_type_enum" NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "currency" character(3) NOT NULL,
        "status" "public"."financial_obligation_status_enum" NOT NULL DEFAULT 'PENDING',
        "source_reference" character varying(200) NOT NULL,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_user_financial_obligations_amount" CHECK ("amount" >= 0),
        CONSTRAINT "PK_user_financial_obligations" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_financial_obligations_source" ON "user_financial_obligations" ("user_id", "ride_id", "obligation_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_financial_obligations_user_status_created" ON "user_financial_obligations" ("user_id", "status", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_financial_obligations" ADD CONSTRAINT "FK_user_financial_obligations_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_financial_obligations" ADD CONSTRAINT "FK_user_financial_obligations_ride" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_financial_obligations" ADD CONSTRAINT "FK_user_financial_obligations_cancellation" FOREIGN KEY ("cancellation_id") REFERENCES "ride_cancellations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_financial_obligations" DROP CONSTRAINT "FK_user_financial_obligations_cancellation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_financial_obligations" DROP CONSTRAINT "FK_user_financial_obligations_ride"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_financial_obligations" DROP CONSTRAINT "FK_user_financial_obligations_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_financial_obligations_user_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_user_financial_obligations_source"`,
    );
    await queryRunner.query(`DROP TABLE "user_financial_obligations"`);

    await queryRunner.query(
      `ALTER TABLE "ride_waitings" DROP CONSTRAINT "FK_ride_waitings_driver_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_waitings" DROP CONSTRAINT "FK_ride_waitings_ride"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_waitings_no_show_available_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_ride_waitings_ride_id"`);
    await queryRunner.query(`DROP TABLE "ride_waitings"`);

    await queryRunner.query(
      `ALTER TABLE "ride_cancellations" DROP CONSTRAINT "FK_ride_cancellations_actor_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_cancellations" DROP CONSTRAINT "FK_ride_cancellations_ride"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_cancellations_fee_status_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_cancellations_actor_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_ride_cancellations_ride_id"`,
    );
    await queryRunner.query(`DROP TABLE "ride_cancellations"`);

    await queryRunner.query(
      `ALTER TABLE "rides" DROP CONSTRAINT "FK_rides_cancellation_policy"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rides_cancellation_policy_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "driver_no_progress_min_meters"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "driver_no_progress_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "driver_arrival_wait_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "driver_no_show_compensation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "passenger_no_show_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "cancellation_arrived_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "cancellation_arriving_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "cancellation_assigned_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "cancellation_grace_period_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" DROP COLUMN "cancellation_policy_id"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_cancellation_policies_active_effective"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_cancellation_policies_code"`,
    );
    await queryRunner.query(`DROP TABLE "cancellation_policies"`);

    await queryRunner.query(
      `DROP TYPE "public"."financial_obligation_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."financial_obligation_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."cancellation_fee_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ride_cancellation_type_enum"`);

    // PostgreSQL no permite retirar valores individuales de enums con DROP VALUE.
    // Los valores añadidos a outbox_event_type_enum y notification_type_enum quedan
    // disponibles tras revertir, pero no afectan las tablas anteriores.
  }
}
