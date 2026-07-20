import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDocumentRevisionsAndTrash1760000009000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "knowledge_document_revision" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "documentId" uuid NOT NULL REFERENCES "knowledge_document"("id") ON DELETE CASCADE,
        "sourceHash" varchar(64),
        "chunkCount" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE "knowledge_document"
        ADD COLUMN "purgeAfter" timestamptz,
        ADD COLUMN "activeRevisionId" uuid;
      ALTER TABLE "knowledge_chunks" ADD COLUMN "revisionId" uuid;
      INSERT INTO "knowledge_document_revision" ("documentId", "sourceHash", "chunkCount", "createdAt")
        SELECT "id", "sourceHash", "chunkCount", "updatedAt" FROM "knowledge_document";
      UPDATE "knowledge_document" d SET "activeRevisionId" = r."id"
        FROM "knowledge_document_revision" r WHERE r."documentId" = d."id";
      UPDATE "knowledge_chunks" c SET "revisionId" = d."activeRevisionId"
        FROM "knowledge_document" d WHERE d."id" = c."documentId";
      ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "FK_chunk_revision"
        FOREIGN KEY ("revisionId") REFERENCES "knowledge_document_revision"("id") ON DELETE CASCADE;
      CREATE INDEX "IDX_chunk_revision_sequence" ON "knowledge_chunks" ("revisionId", "sequence");
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_chunk_revision_sequence";
      ALTER TABLE "knowledge_chunks" DROP CONSTRAINT "FK_chunk_revision";
      ALTER TABLE "knowledge_chunks" DROP COLUMN "revisionId";
      ALTER TABLE "knowledge_document" DROP COLUMN "activeRevisionId", DROP COLUMN "purgeAfter";
      DROP TABLE "knowledge_document_revision";
    `)
  }
}
