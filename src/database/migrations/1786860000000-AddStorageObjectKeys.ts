import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStorageObjectKeys1786860000000 implements MigrationInterface {
  name = 'AddStorageObjectKeys1786860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * STORAGE-R2: columnas nuevas y nullable para el objectKey
     * canónico de Railway Storage Buckets. Las columnas legacy
     * (photo_url / file_url) se conservan sin modificar para no
     * romper datos históricos; conviven mediante compatibilidad
     * gradual en el código (ver src/modules/storage).
     */
    await queryRunner.query(`
      ALTER TABLE "passenger_profiles"
      ADD "photo_object_key" character varying(1024)
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
      ADD "photo_object_key" character varying(1024)
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_documents"
      ADD "file_object_key" character varying(1024)
    `);

    /*
     * A partir de esta migración, un DriverDocument puede crearse
     * exclusivamente mediante Storage (file_object_key, sin
     * file_url legacy). file_url pasa a ser nullable; el dato
     * canónico de "hay archivo" pasa a ser
     * file_url IS NOT NULL OR file_object_key IS NOT NULL.
     */
    await queryRunner.query(`
      ALTER TABLE "driver_documents"
      ALTER COLUMN "file_url" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_documents"
      ADD CONSTRAINT "CHK_driver_documents_file_reference"
      CHECK ("file_url" IS NOT NULL OR "file_object_key" IS NOT NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "driver_documents"
      DROP CONSTRAINT "CHK_driver_documents_file_reference"
    `);

    /*
     * Revertir file_url a NOT NULL solo es seguro si no existen
     * filas creadas exclusivamente vía Storage (file_url NULL). Si
     * existen, este ALTER falla intencionalmente en vez de
     * corromper/inventar datos: es la señal correcta de que el
     * rollback requiere una decisión manual (backfill o conservar
     * la columna nullable).
     */
    await queryRunner.query(`
      ALTER TABLE "driver_documents"
      ALTER COLUMN "file_url" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_documents"
      DROP COLUMN "file_object_key"
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
      DROP COLUMN "photo_object_key"
    `);

    await queryRunner.query(`
      ALTER TABLE "passenger_profiles"
      DROP COLUMN "photo_object_key"
    `);
  }
}
