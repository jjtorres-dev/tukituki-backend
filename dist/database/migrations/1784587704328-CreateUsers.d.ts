import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class CreateUsers1784587704328 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
