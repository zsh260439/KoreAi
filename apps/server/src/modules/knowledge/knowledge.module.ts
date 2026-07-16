import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { KnowledgeQaService } from './answer/knowledge-qa.service'
import { KnowledgeConfigService } from './config/knowledge-config.service'
import { KnowledgeDocumentService } from './ingestion/knowledge-document.service'
import { KnowledgeFileService } from './ingestion/knowledge-file.service'
import { KnowledgeOcrService } from './ingestion/knowledge-ocr.service'
import { KnowledgePdfParserService } from './ingestion/knowledge-pdf-parser.service'
import { KnowledgeController } from './knowledge.controller'
import { KnowledgeBaseEntity } from './entity/knowledge-base.entity'
import { KnowledgeChunkEntity } from './entity/knowledge-chunk.entity'
import { KnowledgeDocumentEntity } from './entity/knowledge-document.entity'
import { KnowledgeRuntimeSettingsEntity } from './entity/knowledge-runtime-settings.entity'
import { KnowledgeBaseService } from './management/knowledge-base.service'
import { KnowledgeQueryAnalysisService } from './query/knowledge-query-analysis.service'
import { KnowledgeQueryEngineService } from './query/knowledge-query-engine.service'
import { KnowledgeQueryService } from './query/knowledge-query.service'
import { EmbeddingService } from './retrieval/embedding.service'
import { KnowledgeBm25Service } from './retrieval/knowledge-bm25.service'
import { KnowledgeRetrievalService } from './retrieval/knowledge-retrieval.service'
import { KnowledgeVectorStoreService } from './retrieval/knowledge-vector-store.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeBaseEntity,
      KnowledgeDocumentEntity,
      KnowledgeChunkEntity,
      KnowledgeRuntimeSettingsEntity
    ])
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeBaseService,
    KnowledgeConfigService,
    KnowledgeDocumentService,
    KnowledgeQueryService,
    KnowledgeFileService,
    KnowledgeBm25Service,
    KnowledgeQueryAnalysisService,
    KnowledgeQueryEngineService,
    KnowledgeRetrievalService,
    KnowledgeOcrService,
    KnowledgePdfParserService,
    EmbeddingService,
    KnowledgeVectorStoreService,
    KnowledgeQaService
  ],
  exports: [KnowledgeQueryService]
})
export class KnowledgeModule {}
