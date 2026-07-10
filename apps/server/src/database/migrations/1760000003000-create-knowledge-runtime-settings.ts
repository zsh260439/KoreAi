import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateKnowledgeRuntimeSettings1760000003000 implements MigrationInterface {
  name = 'CreateKnowledgeRuntimeSettings1760000003000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "knowledge_runtime_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "scope" varchar(32) NOT NULL UNIQUE,
        "runtimeConfig" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "knowledge_runtime_settings";
    `)
  }
}
