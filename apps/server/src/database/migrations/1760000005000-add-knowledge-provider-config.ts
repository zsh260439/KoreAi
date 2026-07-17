import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddKnowledgeProviderConfig1760000005000 implements MigrationInterface {
  name = 'AddKnowledgeProviderConfig1760000005000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_runtime_settings"
      ADD COLUMN IF NOT EXISTS "providerConfig" jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_runtime_settings"
      DROP COLUMN IF EXISTS "providerConfig";
    `)
  }
}
