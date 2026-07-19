import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddKnowledgeDocumentLifecycle1760000006000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_document"
        ADD COLUMN "contentHash" varchar(64),
        ADD COLUMN "deletedAt" timestamptz
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_document"
        DROP COLUMN "deletedAt",
        DROP COLUMN "contentHash"
    `)
  }
}
