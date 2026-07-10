import type { MigrationInterface, QueryRunner } from 'typeorm'

export class DropKnowledgeRuntimeSettings1760000002000 implements MigrationInterface {
  name = 'DropKnowledgeRuntimeSettings1760000002000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "knowledge_runtime_settings";
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "knowledge_runtime_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "scope" varchar(32) NOT NULL,
        "runtimeConfig" jsonb NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `)
  }
}
