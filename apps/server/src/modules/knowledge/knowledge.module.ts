import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'
import { KnowledgeQaService } from './pipeline/answer-generation/knowledge-qa.service'
import { KnowledgeConfigService } from './runtime/config/knowledge-config.service'
import {
  KnowledgeDocumentService,
  KNOWLEDGE_DOCUMENT_CLEANUP_QUEUE,
  KNOWLEDGE_DOCUMENT_REBUILD_QUEUE
} from './pipeline/document-processing/knowledge-document.service'
import {
  KnowledgeDocumentRebuildProcessor
} from './pipeline/document-processing/knowledge-document-rebuild.processor'
import { KnowledgeDocumentCleanupProcessor } from './pipeline/document-processing/knowledge-document-cleanup.processor'
import { KnowledgeFileService } from './pipeline/document-processing/knowledge-file.service'
import { KnowledgeOcrService } from './pipeline/document-processing/knowledge-ocr.service'
import { KnowledgePdfParserService } from './pipeline/document-processing/knowledge-pdf-parser.service'
import { KnowledgeController } from './knowledge.controller'
import { KnowledgeBaseEntity } from './entity/knowledge-base.entity'
import { KnowledgeChunkEntity } from './entity/knowledge-chunk.entity'
import { KnowledgeDocumentEntity } from './entity/knowledge-document.entity'
import { KnowledgeRuntimeSettingsEntity } from './entity/knowledge-runtime-settings.entity'
import { KnowledgeDocumentRevisionEntity } from './entity/knowledge-document-revision.entity'
import { KnowledgeBaseService } from './runtime/management/knowledge-base.service'
import { KnowledgeQueryAnalysisService } from './pipeline/query-understanding/knowledge-query-analysis.service'
import { KnowledgeQueryEngineService } from './pipeline/query-understanding/knowledge-query-engine.service'
import { KnowledgeQueryService } from './pipeline/query-understanding/knowledge-query.service'
import { EmbeddingService } from './pipeline/candidate-retrieval/embedding.service'
import { KnowledgeBm25Service } from './pipeline/candidate-retrieval/knowledge-bm25.service'
import { KnowledgeRetrievalService } from './pipeline/candidate-retrieval/knowledge-retrieval.service'
import { KnowledgeVectorStoreService } from './pipeline/candidate-retrieval/knowledge-vector-store.service'

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

