import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverVehicles1784649132754 implements MigrationInterface {
  name = 'CreateDriverVehicles1784649132754';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."vehicle_type_enum" AS ENUM('MOTOTAXI')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vehicle_status_enum" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_vehicles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driver_profile_id" uuid NOT NULL, "plate" character varying(15) NOT NULL, "brand" character varying(80) NOT NULL, "model" character varying(80) NOT NULL, "year" smallint NOT NULL, "color" character varying(50) NOT NULL, "engine_number" character varying(80) NOT NULL, "chassis_number" character varying(80) NOT NULL, "vehicle_type" "public"."vehicle_type_enum" NOT NULL DEFAULT 'MOTOTAXI', "status" "public"."vehicle_status_enum" NOT NULL DEFAULT 'DRAFT', "rejection_reason" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_8bb98db9d405ee661cc37fbf24" UNIQUE ("driver_profile_id"), CONSTRAINT "PK_62fdc4291e0b744653f218b47b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_vehicles_status" ON "driver_vehicles"  ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_vehicles_chassis_number" ON "driver_vehicles"  ("chassis_number") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_vehicles_engine_number" ON "driver_vehicles"  ("engine_number") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_vehicles_plate" ON "driver_vehicles"  ("plate") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_vehicles_driver_profile_id" ON "driver_vehicles"  ("driver_profile_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_vehicles" ADD CONSTRAINT "FK_8bb98db9d405ee661cc37fbf240" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "driver_vehicles" DROP CONSTRAINT "FK_8bb98db9d405ee661cc37fbf240"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_driver_vehicles_driver_profile_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_driver_vehicles_plate"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_driver_vehicles_engine_number"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_driver_vehicles_chassis_number"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_driver_vehicles_status"`);
    await queryRunner.query(`DROP TABLE "driver_vehicles"`);
    await queryRunner.query(`DROP TYPE "public"."vehicle_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."vehicle_type_enum"`);
  }
}
