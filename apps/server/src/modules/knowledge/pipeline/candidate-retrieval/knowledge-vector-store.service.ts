import { Document } from '@langchain/core/documents'
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit
} from '@nestjs/common'
import { DataSource } from 'typeorm'
import { EmbeddingService } from './embedding.service'

const VECTOR_INDEX_NAME = 'knowledge_chunks_embedding_hnsw_idx'

@Injectable()
export class KnowledgeVectorStoreService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeVectorStoreService.name)

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly dataSource: DataSource
  ) {}

  async onModuleInit(): Promise<void> {
    await this.assertInfrastructureReady()
  }

  async similaritySearchWithScore(
    query: string,
    limit: number,
    knowledgeBaseId?: string
  ): Promise<[Document, number][]> {
    const embedding = await this.embeddingService.embedQuery(query)
    const rows = (await this.dataSource.query(
      `
        SELECT
          chunk.id,
          chunk.content,
          chunk.metadata,
          1 - (chunk.embedding <=> $1::vector) AS score
        FROM "knowledge_chunks" AS chunk
        INNER JOIN "knowledge_document" AS document ON document.id = chunk."documentId"
        WHERE chunk.embedding IS NOT NULL
          AND document.status = 'indexed'
          AND chunk."revisionId" = document."activeRevisionId"
          AND ($2::uuid IS NULL OR chunk."knowledgeBaseId" = $2::uuid)
        ORDER BY chunk.embedding <=> $1::vector
        LIMIT $3
      `,
      [`[${embedding.join(',')}]`, knowledgeBaseId ?? null, limit]
    )) as Array<{
      id: string
      content: string
      metadata: Record<string, unknown> | null
      score: number | string
    }>

    return rows.map((row) => [
      new Document({ id: row.id, pageContent: row.content, metadata: row.metadata ?? {} }),
      Number(row.score)
    ])
  }

  private async assertInfrastructureReady(): Promise<void> {
    const extensions = (await this.dataSource.query(`
      SELECT extname
      FROM pg_extension
      WHERE extname = 'vector'
      LIMIT 1
    `)) as Array<{ extname: string }>

    if (!extensions.length) {
      throw new InternalServerErrorException('pgvector extension is not installed')
    }

    const embeddingColumn = (await this.dataSource.query(`
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'knowledge_chunks'
        AND column_name = 'embedding'
      LIMIT 1
    `)) as Array<{ column_name: string; udt_name: string }>

    if (!embeddingColumn.length || embeddingColumn[0].udt_name !== 'vector') {
      throw new InternalServerErrorException('knowledge_chunks.embedding vector column is missing')
    }

    const indexes = (await this.dataSource.query(
      `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'knowledge_chunks'
          AND indexname = $1
        LIMIT 1
      `,
      [VECTOR_INDEX_NAME]
    )) as Array<{ indexname: string; indexdef: string }>

    if (!indexes.length || !/using\s+hnsw/i.test(indexes[0].indexdef ?? '')) {
      throw new InternalServerErrorException(`${VECTOR_INDEX_NAME} is not a valid HNSW index`)
    }

    this.logger.log('Vector search infrastructure is ready')
  }
}


