import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkersOutboxAndNotifications1784840000000 implements MigrationInterface {
  name = 'CreateWorkersOutboxAndNotifications1784840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."device_platform_enum" AS ENUM('ANDROID', 'IOS', 'WEB')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type_enum" AS ENUM('RIDE_OFFER', 'RIDE_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'RIDE_STARTED', 'RIDE_COMPLETED', 'RIDE_CANCELLED', 'RIDE_EXPIRED', 'RATING_REQUEST')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_delivery_status_enum" AS ENUM('PENDING', 'SENT', 'PARTIAL', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_event_type_enum" AS ENUM('RIDE_REQUESTED', 'RIDE_OFFER_CREATED', 'RIDE_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'RIDE_STARTED', 'RIDE_COMPLETED', 'RIDE_CANCELLED', 'RIDE_EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_event_status_enum" AS ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD')`,
    );

    await queryRunner.query(
      `CREATE TABLE "user_devices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "platform" "public"."device_platform_enum" NOT NULL,
        "push_token" character varying(500) NOT NULL,
        "device_id" character varying(200) NOT NULL,
        "app_version" character varying(50),
        "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_devices" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_devices_user_device" ON "user_devices" ("user_id", "device_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_devices_active_push_token" ON "user_devices" ("push_token") WHERE "revoked_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_devices_user_active" ON "user_devices" ("user_id", "revoked_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_devices" ADD CONSTRAINT "FK_user_devices_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "user_notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "public"."notification_type_enum" NOT NULL,
        "title" character varying(160) NOT NULL,
        "body" character varying(500) NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "dedupe_key" character varying(250) NOT NULL,
        "delivery_status" "public"."notification_delivery_status_enum" NOT NULL DEFAULT 'PENDING',
        "delivery_attempts" integer NOT NULL DEFAULT 0,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "read_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_notifications" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_notifications_dedupe_key" ON "user_notifications" ("dedupe_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_notifications_user_created_at" ON "user_notifications" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_notifications_user_unread" ON "user_notifications" ("user_id", "read_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_notifications" ADD CONSTRAINT "FK_user_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "outbox_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "aggregate_type" character varying(80) NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "event_type" "public"."outbox_event_type_enum" NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" "public"."outbox_event_status_enum" NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT 0,
        "available_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "locked_at" TIMESTAMP WITH TIME ZONE,
        "locked_by" character varying(120),
        "processed_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_events" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_events_status_available_at" ON "outbox_events" ("status", "available_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_events_processing_locked_at" ON "outbox_events" ("status", "locked_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_events_aggregate" ON "outbox_events" ("aggregate_type", "aggregate_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_outbox_events_aggregate"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_outbox_events_processing_locked_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_outbox_events_status_available_at"`,
    );
    await queryRunner.query(`DROP TABLE "outbox_events"`);

    await queryRunner.query(
      `ALTER TABLE "user_notifications" DROP CONSTRAINT "FK_user_notifications_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_notifications_user_unread"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_notifications_user_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_user_notifications_dedupe_key"`,
    );
    await queryRunner.query(`DROP TABLE "user_notifications"`);

    await queryRunner.query(
      `ALTER TABLE "user_devices" DROP CONSTRAINT "FK_user_devices_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_devices_user_active"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_user_devices_active_push_token"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_user_devices_user_device"`,
    );
    await queryRunner.query(`DROP TABLE "user_devices"`);

    await queryRunner.query(`DROP TYPE "public"."outbox_event_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."outbox_event_type_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."notification_delivery_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notification_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."device_platform_enum"`);
  }
}
