import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateKnowledgeRuntimeSettings1760000002000 implements MigrationInterface {
  name = 'CreateKnowledgeRuntimeSettings1760000002000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "knowledge_runtime_settings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "scope" varchar(32) NOT NULL,
        "runtimeConfig" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_knowledge_runtime_settings_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_knowledge_runtime_settings_scope" UNIQUE ("scope")
      );
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "knowledge_runtime_settings";
    `)
  }
}
