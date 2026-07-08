import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateKnowledgeChunksBm25Index1752000003000 implements MigrationInterface {
  name = 'CreateKnowledgeChunksBm25Index1752000003000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = current_schema()
            AND tablename = 'knowledge_chunks'
            AND indexname = 'knowledge_chunks_bm25_idx'
        ) THEN
          EXECUTE $index$
            CREATE INDEX "knowledge_chunks_bm25_idx"
            ON "knowledge_chunks"
            USING bm25 (
              id,
              "knowledgeBaseId",
              "documentId",
              ("documentName"::pdb.chinese_compatible),
              (content::pdb.chinese_compatible),
              (COALESCE("primaryTitle", '')::pdb.chinese_compatible),
              (COALESCE("sectionPath", '')::pdb.chinese_compatible),
              (COALESCE("blockTypes", '')::pdb.simple),
              (COALESCE("fileType", '')::pdb.literal_normalized)
            )
            WITH (
              key_field = 'id',
              search_tokenizer = 'chinese_compatible'
            )
          $index$;
        END IF;
      END
      $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "knowledge_chunks_bm25_idx";
    `)
  }
}
