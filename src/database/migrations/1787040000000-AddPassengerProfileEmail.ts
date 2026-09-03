import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPassengerProfileEmail1787040000000 implements MigrationInterface {
  name = 'AddPassengerProfileEmail1787040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * PASSENGER-PROFILE-EMAIL: correo electrónico opcional en el perfil
     * del pasajero ("Editar perfil", Etapa 1). Columna nueva y nullable,
     * SIN índice y SIN restricción UNIQUE por decisión de producto: no
     * debe bloquear a cuentas familiares que comparten un mismo correo, y
     * una restricción de unicidad sería un vector de enumeración de
     * cuentas. Espejo exacto de driver_profiles.email (ver
     * 1786950000000-PrepareDriverOnboardingR2).
     */
    await queryRunner.query(`
      ALTER TABLE "passenger_profiles"
      ADD "email" character varying(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "passenger_profiles"
      DROP COLUMN "email"
    `);
  }
}
