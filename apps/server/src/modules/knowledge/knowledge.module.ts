import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'
import { KnowledgeQaService } from './answer/knowledge-qa.service'
import { KnowledgeConfigService } from './config/knowledge-config.service'
import {
  KnowledgeDocumentService,
  KNOWLEDGE_DOCUMENT_CLEANUP_QUEUE,
  KNOWLEDGE_DOCUMENT_REBUILD_QUEUE
} from './ingestion/knowledge-document.service'
import {
  KnowledgeDocumentRebuildProcessor
} from './ingestion/knowledge-document-rebuild.processor'
import { KnowledgeDocumentCleanupProcessor } from './ingestion/knowledge-document-cleanup.processor'
import { KnowledgeFileService } from './ingestion/knowledge-file.service'
import { KnowledgeOcrService } from './ingestion/knowledge-ocr.service'
import { KnowledgePdfParserService } from './ingestion/knowledge-pdf-parser.service'
import { KnowledgeController } from './knowledge.controller'
import { KnowledgeBaseEntity } from './entity/knowledge-base.entity'
import { KnowledgeChunkEntity } from './entity/knowledge-chunk.entity'
import { KnowledgeDocumentEntity } from './entity/knowledge-document.entity'
import { KnowledgeRuntimeSettingsEntity } from './entity/knowledge-runtime-settings.entity'
import { KnowledgeDocumentRevisionEntity } from './entity/knowledge-document-revision.entity'
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
    BullModule.registerQueue({
      name: KNOWLEDGE_DOCUMENT_CLEANUP_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true
      }
    }),
    BullModule.registerQueue({
      name: KNOWLEDGE_DOCUMENT_REBUILD_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true
      }
    }),
    TypeOrmModule.forFeature([
      KnowledgeBaseEntity,
      KnowledgeDocumentEntity,
      KnowledgeChunkEntity,
      KnowledgeDocumentRevisionEntity,
      KnowledgeRuntimeSettingsEntity
    ])
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeBaseService,
    KnowledgeConfigService,
    KnowledgeDocumentService,
    KnowledgeDocumentRebuildProcessor,
    KnowledgeDocumentCleanupProcessor,
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
  exports: [KnowledgeConfigService, KnowledgeQueryService]
})
export class KnowledgeModule {}
