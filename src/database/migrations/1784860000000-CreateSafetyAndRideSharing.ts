import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSafetyAndRideSharing1784860000000 implements MigrationInterface {
  name = 'CreateSafetyAndRideSharing1784860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of [
      'SAFETY_INCIDENT_CREATED',
      'SAFETY_INCIDENT_ACKNOWLEDGED',
      'SAFETY_INCIDENT_RESOLVED',
      'EMERGENCY_CONTACT_NOTIFICATION_REQUESTED',
      'RIDE_SHARE_LINK_CREATED',
      'RIDE_SHARE_LINK_REVOKED',
    ]) {
      await queryRunner.query(
        `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }

    for (const value of [
      'SAFETY_INCIDENT',
      'SAFETY_INCIDENT_ACKNOWLEDGED',
      'SAFETY_INCIDENT_RESOLVED',
      'EMERGENCY_CONTACT_ALERT',
      'RIDE_SHARE_LINK',
    ]) {
      await queryRunner.query(
        `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }

    await queryRunner.query(
      `CREATE TYPE "public"."emergency_contact_relationship_enum" AS ENUM('SPOUSE', 'PARENT', 'SIBLING', 'RELATIVE', 'FRIEND', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."safety_incident_type_enum" AS ENUM('MEDICAL_EMERGENCY', 'ACCIDENT', 'THREAT', 'HARASSMENT', 'ROBBERY', 'UNSAFE_DRIVING', 'VEHICLE_FAILURE', 'LOST_CONTACT', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."safety_incident_severity_enum" AS ENUM('MEDIUM', 'HIGH', 'CRITICAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."safety_incident_status_enum" AS ENUM('OPEN', 'ACKNOWLEDGED', 'IN_REVIEW', 'RESOLVED', 'FALSE_ALARM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ride_share_link_status_enum" AS ENUM('ACTIVE', 'REVOKED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."emergency_contact_alert_status_enum" AS ENUM('PENDING_EXTERNAL_PROVIDER', 'IN_APP_DELIVERED', 'FAILED')`,
    );

    await queryRunner.query(
      `CREATE TABLE "emergency_contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "phone_e164" character varying(20) NOT NULL,
        "relationship" "public"."emergency_contact_relationship_enum" NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "is_verified" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "CHK_emergency_contacts_phone_e164" CHECK ("phone_e164" ~ '^\\+[1-9][0-9]{7,14}$'),
        CONSTRAINT "PK_emergency_contacts" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_emergency_contacts_user_phone_active" ON "emergency_contacts" ("user_id", "phone_e164") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_emergency_contacts_user_primary_active" ON "emergency_contacts" ("user_id") WHERE "is_primary" = true AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_emergency_contacts_user_created_at" ON "emergency_contacts" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "emergency_contacts" ADD CONSTRAINT "FK_emergency_contacts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "ride_safety_incidents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ride_id" uuid NOT NULL,
        "reporter_user_id" uuid NOT NULL,
        "reporter_role" "public"."ride_status_actor_enum" NOT NULL,
        "incident_type" "public"."safety_incident_type_enum" NOT NULL,
        "severity" "public"."safety_incident_severity_enum" NOT NULL,
        "status" "public"."safety_incident_status_enum" NOT NULL DEFAULT 'OPEN',
        "position" geography(Point,4326) NOT NULL,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "accuracy" double precision,
        "description" character varying(500),
        "ride_status_snapshot" character varying(40) NOT NULL,
        "passenger_snapshot" jsonb NOT NULL,
        "driver_snapshot" jsonb,
        "vehicle_snapshot" jsonb,
        "acknowledged_by_user_id" uuid,
        "acknowledged_at" TIMESTAMP WITH TIME ZONE,
        "resolved_by_user_id" uuid,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "resolution_notes" character varying(1000),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_ride_safety_incidents_accuracy" CHECK ("accuracy" IS NULL OR ("accuracy" >= 0 AND "accuracy" <= 100)),
        CONSTRAINT "CHK_ride_safety_incidents_coordinates" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
        CONSTRAINT "PK_ride_safety_incidents" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_safety_incidents_ride_created_at" ON "ride_safety_incidents" ("ride_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_safety_incidents_status_severity_created" ON "ride_safety_incidents" ("status", "severity", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_safety_incidents_position" ON "ride_safety_incidents" USING GiST ("position")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_safety_incidents" ADD CONSTRAINT "FK_ride_safety_incidents_ride" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_safety_incidents" ADD CONSTRAINT "FK_ride_safety_incidents_reporter" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_safety_incidents" ADD CONSTRAINT "FK_ride_safety_incidents_ack_user" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_safety_incidents" ADD CONSTRAINT "FK_ride_safety_incidents_resolved_user" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "ride_share_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ride_id" uuid NOT NULL,
        "created_by_user_id" uuid NOT NULL,
        "token_hash" character(64) NOT NULL,
        "status" "public"."ride_share_link_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "last_accessed_at" TIMESTAMP WITH TIME ZONE,
        "access_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_ride_share_links_access_count" CHECK ("access_count" >= 0),
        CONSTRAINT "PK_ride_share_links" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_share_links_token_hash" ON "ride_share_links" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_share_links_ride_status_expires" ON "ride_share_links" ("ride_id", "status", "expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_share_links_creator_created" ON "ride_share_links" ("created_by_user_id", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_share_links" ADD CONSTRAINT "FK_ride_share_links_ride" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_share_links" ADD CONSTRAINT "FK_ride_share_links_creator" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "ride_share_access_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "share_link_id" uuid NOT NULL,
        "ip_hash" character(64) NOT NULL,
        "user_agent" character varying(500),
        "accessed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ride_share_access_logs" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_share_access_logs_link_accessed" ON "ride_share_access_logs" ("share_link_id", "accessed_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_share_access_logs_link_ip_accessed" ON "ride_share_access_logs" ("share_link_id", "ip_hash", "accessed_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_share_access_logs" ADD CONSTRAINT "FK_ride_share_access_logs_link" FOREIGN KEY ("share_link_id") REFERENCES "ride_share_links"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "emergency_contact_alerts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "incident_id" uuid NOT NULL,
        "contact_id" uuid NOT NULL,
        "contact_name" character varying(120) NOT NULL,
        "contact_phone_e164" character varying(20) NOT NULL,
        "matched_user_id" uuid,
        "status" "public"."emergency_contact_alert_status_enum" NOT NULL,
        "delivery_attempts" integer NOT NULL DEFAULT 0,
        "delivered_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_emergency_contact_alerts_attempts" CHECK ("delivery_attempts" >= 0),
        CONSTRAINT "PK_emergency_contact_alerts" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_emergency_contact_alerts_incident_contact" ON "emergency_contact_alerts" ("incident_id", "contact_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_emergency_contact_alerts_status_created" ON "emergency_contact_alerts" ("status", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "emergency_contact_alerts" ADD CONSTRAINT "FK_emergency_contact_alerts_incident" FOREIGN KEY ("incident_id") REFERENCES "ride_safety_incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "emergency_contact_alerts" ADD CONSTRAINT "FK_emergency_contact_alerts_contact" FOREIGN KEY ("contact_id") REFERENCES "emergency_contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "emergency_contact_alerts" ADD CONSTRAINT "FK_emergency_contact_alerts_matched_user" FOREIGN KEY ("matched_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "emergency_contact_alerts" DROP CONSTRAINT "FK_emergency_contact_alerts_matched_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "emergency_contact_alerts" DROP CONSTRAINT "FK_emergency_contact_alerts_contact"`,
    );
    await queryRunner.query(
      `ALTER TABLE "emergency_contact_alerts" DROP CONSTRAINT "FK_emergency_contact_alerts_incident"`,
    );
    await queryRunner.query(`DROP TABLE "emergency_contact_alerts"`);

    await queryRunner.query(
      `ALTER TABLE "ride_share_access_logs" DROP CONSTRAINT "FK_ride_share_access_logs_link"`,
    );
    await queryRunner.query(`DROP TABLE "ride_share_access_logs"`);

    await queryRunner.query(
      `ALTER TABLE "ride_share_links" DROP CONSTRAINT "FK_ride_share_links_creator"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_share_links" DROP CONSTRAINT "FK_ride_share_links_ride"`,
    );
    await queryRunner.query(`DROP TABLE "ride_share_links"`);

    await queryRunner.query(
      `ALTER TABLE "ride_safety_incidents" DROP CONSTRAINT "FK_ride_safety_incidents_resolved_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_safety_incidents" DROP CONSTRAINT "FK_ride_safety_incidents_ack_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_safety_incidents" DROP CONSTRAINT "FK_ride_safety_incidents_reporter"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_safety_incidents" DROP CONSTRAINT "FK_ride_safety_incidents_ride"`,
    );
    await queryRunner.query(`DROP TABLE "ride_safety_incidents"`);

    await queryRunner.query(
      `ALTER TABLE "emergency_contacts" DROP CONSTRAINT "FK_emergency_contacts_user"`,
    );
    await queryRunner.query(`DROP TABLE "emergency_contacts"`);

    await queryRunner.query(
      `DROP TYPE "public"."emergency_contact_alert_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ride_share_link_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."safety_incident_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."safety_incident_severity_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."safety_incident_type_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."emergency_contact_relationship_enum"`,
    );

    // Los valores añadidos a enums existentes quedan disponibles tras revertir.
  }
}
