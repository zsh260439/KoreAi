import type { MigrationInterface, QueryRunner } from 'typeorm'

const VECTOR_INDEX_NAME = 'knowledge_chunks_embedding_hnsw_idx'
const VECTOR_DIMENSIONS = 1024

export class CreateKnowledgeChunksHnswIndex1760000004000 implements MigrationInterface {
  name = 'CreateKnowledgeChunksHnswIndex1760000004000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
    `)

    await queryRunner.query(`
      ALTER TABLE "knowledge_chunks"
      ALTER COLUMN "embedding"
      TYPE vector(${VECTOR_DIMENSIONS})
      USING CASE
        WHEN "embedding" IS NULL THEN NULL
        ELSE "embedding"::vector(${VECTOR_DIMENSIONS})
      END;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = current_schema()
            AND tablename = 'knowledge_chunks'
            AND indexname = '${VECTOR_INDEX_NAME}'
        ) THEN
          EXECUTE $index$
            CREATE INDEX "${VECTOR_INDEX_NAME}"
            ON "knowledge_chunks"
            USING hnsw ("embedding" vector_cosine_ops)
            WITH (
              m = 16,
              ef_construction = 64
            )
            WHERE "embedding" IS NOT NULL
          $index$;
        END IF;
      END
      $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${VECTOR_INDEX_NAME}";
    `)
  }
}
