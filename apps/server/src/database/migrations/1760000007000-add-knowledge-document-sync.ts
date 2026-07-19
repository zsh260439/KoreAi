import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddKnowledgeDocumentSync1760000007000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_document"
        ADD COLUMN "sourceHash" varchar(64),
        ADD COLUMN "sourceChangedAt" timestamptz,
        ADD COLUMN "lastAutoSyncAt" timestamptz;

      ALTER TABLE "knowledge_chunks"
        ADD COLUMN "contentHash" varchar(64)
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_chunks" DROP COLUMN "contentHash";
      ALTER TABLE "knowledge_document"
        DROP COLUMN "lastAutoSyncAt",
        DROP COLUMN "sourceChangedAt",
        DROP COLUMN "sourceHash"
    `)
  }
}
