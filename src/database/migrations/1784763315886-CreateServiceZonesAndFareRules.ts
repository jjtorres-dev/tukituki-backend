import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceZonesAndFareRules1784763315886 implements MigrationInterface {
  name = 'CreateServiceZonesAndFareRules1784763315886';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."service_zone_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "service_zones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120) NOT NULL, "code" character varying(50) NOT NULL, "description" character varying(500), "boundary" geography(Polygon,4326) NOT NULL, "status" "public"."service_zone_status_enum" NOT NULL DEFAULT 'INACTIVE', "priority" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1fadb6afc50f01a0d66ab68c12d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_service_zones_boundary" ON "service_zones" USING gist ("boundary") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_service_zones_status_priority" ON "service_zones"  ("status", "priority") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_service_zones_code" ON "service_zones"  ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fare_rule_status_enum" AS ENUM('DRAFT', 'ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fare_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "service_zone_id" uuid NOT NULL, "name" character varying(120) NOT NULL, "base_fare" numeric(10,2) NOT NULL, "minimum_fare" numeric(10,2) NOT NULL, "price_per_km" numeric(10,4) NOT NULL, "price_per_minute" numeric(10,4) NOT NULL, "booking_fee" numeric(10,2) NOT NULL DEFAULT '0.00', "waiting_price_per_minute" numeric(10,4) NOT NULL DEFAULT '0.0000', "cancellation_fee" numeric(10,2) NOT NULL DEFAULT '0.00', "night_multiplier" numeric(6,3) NOT NULL DEFAULT '1.000', "rain_multiplier" numeric(6,3) NOT NULL DEFAULT '1.000', "currency" character(3) NOT NULL DEFAULT 'PEN', "status" "public"."fare_rule_status_enum" NOT NULL DEFAULT 'DRAFT', "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL, "effective_until" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1c92ac1ed8aaacbdb493f50ca91" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fare_rules_effective_until" ON "fare_rules"  ("effective_until") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fare_rules_zone_status_effective_from" ON "fare_rules"  ("service_zone_id", "status", "effective_from") `,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ADD CONSTRAINT "FK_991f6b9af3f9b93dd9439750295" FOREIGN KEY ("service_zone_id") REFERENCES "service_zones"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fare_rules" DROP CONSTRAINT "FK_991f6b9af3f9b93dd9439750295"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fare_rules_zone_status_effective_from"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fare_rules_effective_until"`,
    );
    await queryRunner.query(`DROP TABLE "fare_rules"`);
    await queryRunner.query(`DROP TYPE "public"."fare_rule_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_service_zones_code"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_service_zones_status_priority"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_service_zones_boundary"`);
    await queryRunner.query(`DROP TABLE "service_zones"`);
    await queryRunner.query(`DROP TYPE "public"."service_zone_status_enum"`);
  }
}
