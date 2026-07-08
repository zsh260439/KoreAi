import type { MigrationInterface, QueryRunner } from 'typeorm'

export class InstallPgSearch1752000000000 implements MigrationInterface {
  name = 'InstallPgSearch1752000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_search;`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS pg_search CASCADE;`)
  }
}
