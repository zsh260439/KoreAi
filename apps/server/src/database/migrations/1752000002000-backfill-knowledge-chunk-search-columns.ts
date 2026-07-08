import type { MigrationInterface, QueryRunner } from 'typeorm'

export class BackfillKnowledgeChunkSearchColumns1752000002000 implements MigrationInterface {
  name = 'BackfillKnowledgeChunkSearchColumns1752000002000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "knowledge_chunks" AS chunk
      SET
        "knowledgeBaseId" = COALESCE(
          (chunk.metadata ->> 'knowledgeBaseId')::uuid,
          doc."knowledgeBaseId"
        ),
        "documentName" = COALESCE(
          NULLIF(chunk.metadata ->> 'documentName', ''),
          doc.name
        ),
        "fileType" = COALESCE(
          NULLIF(chunk.metadata ->> 'fileType', ''),
          doc."fileType"
        ),
        "sourceKind" = NULLIF(chunk.metadata ->> 'sourceKind', ''),
        "primaryTitle" = COALESCE(
          NULLIF(chunk.metadata -> 'titles' ->> 0, ''),
          NULLIF(chunk.metadata -> 'blocks' -> 0 ->> 'title', '')
        ),
        "sectionPath" = NULLIF(
          ARRAY_TO_STRING(
            ARRAY(
              SELECT jsonb_array_elements_text(
                COALESCE(chunk.metadata -> 'sectionPaths' -> 0, '[]'::jsonb)
              )
            ),
            ' > '
          ),
          ''
        ),
        "blockTypes" = NULLIF(
          ARRAY_TO_STRING(
            ARRAY(
              SELECT DISTINCT jsonb_array_elements_text(
                COALESCE(chunk.metadata -> 'blockTypes', '[]'::jsonb)
              )
            ),
            ' '
          ),
          ''
        )
      FROM "knowledge_document" AS doc
      WHERE doc.id = chunk."documentId";
    `)
  }

  public async down(): Promise<void> {
    throw new Error('BackfillKnowledgeChunkSearchColumns migration is irreversible')
  }
}
