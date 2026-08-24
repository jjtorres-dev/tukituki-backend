import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PrepareDriverOnboardingR21786950000000 implements MigrationInterface {
  name = 'PrepareDriverOnboardingR21786950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * DRIVER-ONBOARDING-R2: decisión de producto de JuanJo — el paso
     * 2 ("Sobre ti") del onboarding nuevo ya no pide dirección
     * domiciliaria y agrega correo electrónico opcional. address se
     * conserva (columna y datos existentes intactos), solo deja de
     * ser NOT NULL. email es nueva, nullable, sin unicidad (no hay
     * decisión de producto que la exija).
     */
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
      ADD "email" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
      ALTER COLUMN "address" DROP NOT NULL
    `);

    /*
     * DRIVER-ONBOARDING-R2: el paso 3 ("Mototaxi") ya no pide número
     * de motor ni de chasis manualmente — pasan a nullable, sin
     * borrar datos ni índices UNIQUE existentes (Postgres permite
     * múltiples NULL en un índice UNIQUE, confirmado contra el
     * esquema real antes de este cambio).
     */
    await queryRunner.query(`
      ALTER TABLE "driver_vehicles"
      ALTER COLUMN "engine_number" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_vehicles"
      ALTER COLUMN "chassis_number" DROP NOT NULL
    `);

    /*
     * ownership (propio/alquilado) es requisito nuevo del paso 3.
     * La columna queda nullable a nivel DB por compatibilidad con
     * los vehículos ya existentes en STAGING (no se inventa un valor
     * OWNED/RENTED para ellos sin evidencia); CreateDriverVehicleDto
     * ya lo exige para altas nuevas a partir de este checkpoint.
     */
    await queryRunner.query(`
      CREATE TYPE "public"."vehicle_ownership_enum" AS ENUM('OWNED', 'RENTED')
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_vehicles"
      ADD "ownership" "public"."vehicle_ownership_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "driver_vehicles"
      DROP COLUMN "ownership"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."vehicle_ownership_enum"
    `);

    /*
     * Revertir engine_number/chassis_number/address a NOT NULL solo
     * es seguro si no existen filas creadas o editadas después de
     * este deploy sin esos valores (el onboarding nuevo ya no los
     * pide). Si existen, estos ALTER fallan intencionalmente en vez
     * de inventar un valor de relleno: la señal correcta de que el
     * rollback requiere una decisión manual, no una migración
     * automática con pérdida/invención de datos.
     */
    await queryRunner.query(`
      ALTER TABLE "driver_vehicles"
      ALTER COLUMN "chassis_number" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_vehicles"
      ALTER COLUMN "engine_number" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
      ALTER COLUMN "address" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
      DROP COLUMN "email"
    `);
  }
}
