import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOperationsReportingAndAudit1784870000000 implements MigrationInterface {
  name = 'CreateOperationsReportingAndAudit1784870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."admin_audit_outcome_enum" AS ENUM('SUCCESS', 'FAILURE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "admin_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actor_user_id" uuid NOT NULL,
        "actor_roles" jsonb NOT NULL,
        "action" character varying(180) NOT NULL,
        "resource_type" character varying(80) NOT NULL,
        "resource_id" character varying(120),
        "http_method" character varying(10) NOT NULL,
        "route" character varying(300) NOT NULL,
        "outcome" "public"."admin_audit_outcome_enum" NOT NULL,
        "response_status_code" smallint NOT NULL,
        "request_id" character varying(100) NOT NULL,
        "ip_hash" character(64),
        "user_agent" character varying(500),
        "metadata" jsonb,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_admin_audit_logs_status_code"
          CHECK ("response_status_code" BETWEEN 100 AND 599),
        CONSTRAINT "PK_admin_audit_logs" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_actor_occurred"
       ON "admin_audit_logs" ("actor_user_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_resource_occurred"
       ON "admin_audit_logs" ("resource_type", "resource_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_outcome_occurred"
       ON "admin_audit_logs" ("outcome", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_request_id"
       ON "admin_audit_logs" ("request_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_audit_logs"
       ADD CONSTRAINT "FK_admin_audit_logs_actor"
       FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE FUNCTION prevent_admin_audit_log_mutation()
       RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION 'admin_audit_logs is append-only';
       END;
       $$ LANGUAGE plpgsql`,
    );
    await queryRunner.query(
      `CREATE TRIGGER "TRG_admin_audit_logs_immutable"
       BEFORE UPDATE OR DELETE ON "admin_audit_logs"
       FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation()`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_rides_requested_at_status_reporting"
       ON "rides" ("requested_at", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_origin_zone_requested_reporting"
       ON "rides" ("origin_zone_id", "requested_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_cancellations_created_reporting"
       ON "ride_cancellations" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_cancellations_created_reporting"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rides_origin_zone_requested_reporting"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rides_requested_at_status_reporting"`,
    );

    await queryRunner.query(
      `DROP TRIGGER "TRG_admin_audit_logs_immutable" ON "admin_audit_logs"`,
    );
    await queryRunner.query(`DROP FUNCTION prevent_admin_audit_log_mutation()`);
    await queryRunner.query(
      `ALTER TABLE "admin_audit_logs"
       DROP CONSTRAINT "FK_admin_audit_logs_actor"`,
    );
    await queryRunner.query(`DROP TABLE "admin_audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."admin_audit_outcome_enum"`);
  }
}
