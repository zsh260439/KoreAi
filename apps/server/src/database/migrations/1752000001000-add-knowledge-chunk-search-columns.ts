import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddKnowledgeChunkSearchColumns1752000001000 implements MigrationInterface {
  name = 'AddKnowledgeChunkSearchColumns1752000001000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_chunks"
        ADD COLUMN IF NOT EXISTS "knowledgeBaseId" uuid,
        ADD COLUMN IF NOT EXISTS "documentName" varchar(255),
        ADD COLUMN IF NOT EXISTS "fileType" varchar(50),
        ADD COLUMN IF NOT EXISTS "sourceKind" varchar(50),
        ADD COLUMN IF NOT EXISTS "primaryTitle" varchar(255),
        ADD COLUMN IF NOT EXISTS "sectionPath" text,
        ADD COLUMN IF NOT EXISTS "blockTypes" text;
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "knowledge_chunks_knowledgeBaseId_idx"
        ON "knowledge_chunks" ("knowledgeBaseId");
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "knowledge_chunks_documentId_idx"
        ON "knowledge_chunks" ("documentId");
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "knowledge_chunks_documentId_idx";
    `)

    await queryRunner.query(`
      DROP INDEX IF EXISTS "knowledge_chunks_knowledgeBaseId_idx";
    `)

    await queryRunner.query(`
      ALTER TABLE "knowledge_chunks"
        DROP COLUMN IF EXISTS "blockTypes",
        DROP COLUMN IF EXISTS "sectionPath",
        DROP COLUMN IF EXISTS "primaryTitle",
        DROP COLUMN IF EXISTS "sourceKind",
        DROP COLUMN IF EXISTS "fileType",
        DROP COLUMN IF EXISTS "documentName",
        DROP COLUMN IF EXISTS "knowledgeBaseId";
    `)
  }
}
