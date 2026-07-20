import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRevisionExpiry1760000010000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_document_revision" ADD COLUMN "expiresAt" timestamptz;
      CREATE INDEX "IDX_revision_expiry" ON "knowledge_document_revision" ("expiresAt");
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_revision_expiry";
      ALTER TABLE "knowledge_document_revision" DROP COLUMN "expiresAt";
    `)
  }
}
