import { Document } from '@langchain/core/documents'
import { PGVectorStore } from '@langchain/pgvector'
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common'
import { DataSource } from 'typeorm'
import { EmbeddingService } from './embedding.service'

const VECTOR_INDEX_NAME = 'knowledge_chunks_embedding_hnsw_idx'

@Injectable()
export class KnowledgeVectorStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeVectorStoreService.name)
  private storePromise: Promise<PGVectorStore> | null = null

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly dataSource: DataSource
  ) {}

  async onModuleInit(): Promise<void> {
    await this.assertInfrastructureReady()
  }

  // 这里保持现有调用方式不变，只补基础设施校验和索引保障。
  async similaritySearchWithScore(
    query: string,
    limit: number,
    knowledgeBaseId?: string
  ): Promise<[Document, number][]> {
    const store = await this.getStore()

    if (!knowledgeBaseId) {
      return store.similaritySearchWithScore(query, limit)
    }

    return store.similaritySearchWithScore(query, limit, { knowledgeBaseId })
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.storePromise) {
      return
    }

    const store = await this.storePromise
    await store.end()
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
    `)) as Array<{
      column_name: string
      udt_name: string
    }>

    if (!embeddingColumn.length || embeddingColumn[0].udt_name !== 'vector') {
      throw new InternalServerErrorException(
        'knowledge_chunks.embedding vector column is missing'
      )
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
    )) as Array<{
      indexname: string
      indexdef: string
    }>

    if (!indexes.length) {
      throw new InternalServerErrorException(`${VECTOR_INDEX_NAME} is not installed`)
    }

    if (!/using\s+hnsw/i.test(indexes[0].indexdef ?? '')) {
      throw new InternalServerErrorException(
        `${VECTOR_INDEX_NAME} exists but is not an HNSW index`
      )
    }

    this.logger.log('Vector search infrastructure is ready')
  }

  private getStore(): Promise<PGVectorStore> {
    if (!this.storePromise) {
      this.storePromise = PGVectorStore.initialize(this.embeddingService.getClient(), {
        postgresConnectionOptions: {
          connectionString: process.env.DATABASE_URL
        },
        tableName: 'knowledge_chunks',
        columns: {
          idColumnName: 'id',
          vectorColumnName: 'embedding',
          contentColumnName: 'content',
          metadataColumnName: 'metadata'
        },
        distanceStrategy: 'cosine',
        // 这里必须和 HNSW 索引的 operator class 保持一致。
        scoreNormalization: 'similarity'
      })
    }

    return this.storePromise
  }
}
