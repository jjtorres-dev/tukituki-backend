import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePassengerProfiles1784644531990 implements MigrationInterface {
    name = 'CreatePassengerProfiles1784644531990'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "passenger_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "first_name" character varying(80) NOT NULL, "last_name" character varying(80) NOT NULL, "photo_url" character varying(2048), "emergency_contact_name" character varying(120), "emergency_contact_phone_e164" character varying(20), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_e933808e9e0d6852ce36293bdc1" UNIQUE ("user_id"), CONSTRAINT "REL_e933808e9e0d6852ce36293bdc" UNIQUE ("user_id"), CONSTRAINT "PK_70936a0d464b476507cf4f2889e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "passenger_profiles" ADD CONSTRAINT "FK_e933808e9e0d6852ce36293bdc1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "passenger_profiles" DROP CONSTRAINT "FK_e933808e9e0d6852ce36293bdc1"`);
        await queryRunner.query(`DROP TABLE "passenger_profiles"`);
    }

}
