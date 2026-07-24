import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDigitalPayments1784890000000 implements MigrationInterface {
  name = 'CreateDigitalPayments1784890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of ['YAPE', 'PLIN', 'CARD']) {
      await queryRunner.query(
        `ALTER TYPE "public"."payment_method_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
    for (const value of ['PROCESSING', 'FAILED', 'EXPIRED']) {
      await queryRunner.query(
        `ALTER TYPE "public"."ride_payment_status_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
    for (const value of [
      'DIGITAL_PAYMENT_CONFIRMED',
      'DIGITAL_PAYMENT_FAILED',
    ]) {
      await queryRunner.query(
        `ALTER TYPE "public"."outbox_event_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
      await queryRunner.query(
        `ALTER TYPE "public"."notification_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }

    await queryRunner.query(
      `CREATE TYPE "public"."payment_provider_enum" AS ENUM('IZIPAY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."digital_payment_attempt_status_enum"
       AS ENUM('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "digital_payment_attempts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "payment_id" uuid NOT NULL,
        "provider" "public"."payment_provider_enum" NOT NULL,
        "method" "public"."payment_method_enum" NOT NULL,
        "status" "public"."digital_payment_attempt_status_enum"
          NOT NULL DEFAULT 'CREATED',
        "idempotency_key" character varying(100) NOT NULL,
        "transaction_id" character varying(40) NOT NULL,
        "order_number" character varying(40) NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "currency" character(3) NOT NULL,
        "session_expires_at" TIMESTAMP WITH TIME ZONE,
        "provider_authorization_code" character varying(100),
        "provider_reference_number" character varying(100),
        "provider_unique_id" character varying(100),
        "provider_state_message" character varying(200),
        "failure_code" character varying(50),
        "failure_message" character varying(500),
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_digital_payment_attempts_amount"
          CHECK ("amount" >= 0),
        CONSTRAINT "PK_digital_payment_attempts" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_digital_payment_attempts_transaction"
       ON "digital_payment_attempts" ("transaction_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_digital_payment_attempts_order"
       ON "digital_payment_attempts" ("order_number")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_digital_payment_attempts_payment_idempotency"
       ON "digital_payment_attempts" ("payment_id", "idempotency_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_digital_payment_attempts_payment_created"
       ON "digital_payment_attempts" ("payment_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_digital_payment_attempts_status_created"
       ON "digital_payment_attempts" ("status", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "digital_payment_attempts"
       ADD CONSTRAINT "FK_digital_payment_attempts_payment"
       FOREIGN KEY ("payment_id") REFERENCES "ride_payments"("id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "digital_payment_attempts"
       DROP CONSTRAINT "FK_digital_payment_attempts_payment"`,
    );
    await queryRunner.query(`DROP TABLE "digital_payment_attempts"`);
    await queryRunner.query(
      `DROP TYPE "public"."digital_payment_attempt_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."payment_provider_enum"`);

    // Los valores añadidos a enums compartidos permanecen tras revertir.
  }
}
