import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowDisabledRideCommissionRate1786312800000 implements MigrationInterface {
  name = 'AllowDisabledRideCommissionRate1786312800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * Cuando COMMISSION_MODE está desactivado,
     * los viajes nuevos conservan explícitamente:
     *
     * platform_commission_rate_bps = 0
     * commission_policy_id = NULL
     *
     * Si en el futuro se activa una política de comisión,
     * las tasas admitidas continúan siendo de 300 a 500 bps
     * (3% a 5%).
     */
    await queryRunner.query(`
      ALTER TABLE "rides"
      DROP CONSTRAINT "CHK_rides_platform_commission_rate"
    `);

    await queryRunner.query(`
      ALTER TABLE "rides"
      ALTER COLUMN "platform_commission_rate_bps"
      SET DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD CONSTRAINT "CHK_rides_platform_commission_rate"
      CHECK (
        "platform_commission_rate_bps" = 0
        OR "platform_commission_rate_bps" BETWEEN 300 AND 500
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * El esquema anterior no admite tasa 0.
     *
     * Para que un rollback técnico pueda restaurar
     * esa restricción, los registros con tasa 0
     * deben volver al antiguo valor por defecto de 500.
     */
    await queryRunner.query(`
      ALTER TABLE "rides"
      DROP CONSTRAINT "CHK_rides_platform_commission_rate"
    `);

    await queryRunner.query(`
      UPDATE "rides"
      SET "platform_commission_rate_bps" = 500
      WHERE "platform_commission_rate_bps" = 0
    `);

    await queryRunner.query(`
      ALTER TABLE "rides"
      ALTER COLUMN "platform_commission_rate_bps"
      SET DEFAULT 500
    `);

    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD CONSTRAINT "CHK_rides_platform_commission_rate"
      CHECK ("platform_commission_rate_bps" BETWEEN 300 AND 500)
    `);
  }
}
