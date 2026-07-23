import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRideHistoryAndRatings1784830000000 implements MigrationInterface {
  name = 'CreateRideHistoryAndRatings1784830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ride_rating_reviewer_role_enum" AS ENUM('PASSENGER', 'DRIVER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ride_rating_tag_enum" AS ENUM('SAFE_DRIVING', 'FRIENDLY', 'CLEAN_VEHICLE', 'PUNCTUAL', 'GOOD_COMMUNICATION', 'RESPECTFUL', 'CLEAR_PICKUP_POINT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "passenger_profiles" ADD "rating_average" numeric(3,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE "passenger_profiles" ADD "rating_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD "rating_average" numeric(3,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD "rating_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_ratings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ride_id" uuid NOT NULL,
        "reviewer_user_id" uuid NOT NULL,
        "reviewed_user_id" uuid NOT NULL,
        "reviewer_role" "public"."ride_rating_reviewer_role_enum" NOT NULL,
        "score" smallint NOT NULL,
        "comment" character varying(500),
        "tags" "public"."ride_rating_tag_enum" array NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_ride_ratings_score" CHECK ("score" BETWEEN 1 AND 5),
        CONSTRAINT "CHK_ride_ratings_distinct_users" CHECK ("reviewer_user_id" <> "reviewed_user_id"),
        CONSTRAINT "PK_ride_ratings" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_ratings_direction" ON "ride_ratings" ("ride_id", "reviewer_user_id", "reviewed_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_ratings_reviewed_user_created_at" ON "ride_ratings" ("reviewed_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ride_ratings_ride_id" ON "ride_ratings" ("ride_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" ADD CONSTRAINT "FK_ride_ratings_ride" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" ADD CONSTRAINT "FK_ride_ratings_reviewer_user" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" ADD CONSTRAINT "FK_ride_ratings_reviewed_user" FOREIGN KEY ("reviewed_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" DROP CONSTRAINT "FK_ride_ratings_reviewed_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" DROP CONSTRAINT "FK_ride_ratings_reviewer_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" DROP CONSTRAINT "FK_ride_ratings_ride"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_ride_ratings_ride_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ride_ratings_reviewed_user_created_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_ride_ratings_direction"`);
    await queryRunner.query(`DROP TABLE "ride_ratings"`);
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" DROP COLUMN "rating_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" DROP COLUMN "rating_average"`,
    );
    await queryRunner.query(
      `ALTER TABLE "passenger_profiles" DROP COLUMN "rating_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "passenger_profiles" DROP COLUMN "rating_average"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ride_rating_tag_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."ride_rating_reviewer_role_enum"`,
    );
  }
}
