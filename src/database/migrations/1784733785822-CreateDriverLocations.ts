import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverLocations1784733785822 implements MigrationInterface {
  name = 'CreateDriverLocations1784733785822';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "driver_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driver_profile_id" uuid NOT NULL, "position" geography(Point,4326) NOT NULL, "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "heading" double precision, "speed" double precision, "accuracy" double precision, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_ff135f0099ae29d08a1a446fc7" UNIQUE ("driver_profile_id"), CONSTRAINT "PK_31aae5c417762bf01ec26a53f02" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_locations_position" ON "driver_locations" USING gist ("position") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_driver_locations_recorded_at" ON "driver_locations"  ("recorded_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_driver_locations_driver_profile_id" ON "driver_locations"  ("driver_profile_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_locations" ADD CONSTRAINT "FK_ff135f0099ae29d08a1a446fc74" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "driver_locations" DROP CONSTRAINT "FK_ff135f0099ae29d08a1a446fc74"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_driver_locations_driver_profile_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_locations_recorded_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_driver_locations_position"`,
    );
    await queryRunner.query(`DROP TABLE "driver_locations"`);
  }
}
