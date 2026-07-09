import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddKnowledgeBaseRuntimeConfig1760000001000 implements MigrationInterface {
  name = 'AddKnowledgeBaseRuntimeConfig1760000001000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_bases"
        ADD COLUMN IF NOT EXISTS "runtimeConfig" jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_bases"
        DROP COLUMN IF EXISTS "runtimeConfig";
    `)
  }
}
