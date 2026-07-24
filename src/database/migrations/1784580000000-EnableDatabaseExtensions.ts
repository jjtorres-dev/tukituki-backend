import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableDatabaseExtensions1784580000000 implements MigrationInterface {
  name = 'EnableDatabaseExtensions1784580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`,
    );
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public`,
    );
  }

  public async down(): Promise<void> {
    /*
     * Las extensiones pueden ser compartidas por otros esquemas o aplicaciones.
     * Revertir esta migración no debe intentar eliminarlas.
     */
  }
}
