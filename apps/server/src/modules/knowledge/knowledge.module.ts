import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmbeddingService } from './composables/embedding.service'
import { KnowledgeBm25Service } from './composables/knowledge-bm25.service'
import { KnowledgeFileService } from './composables/knowledge-file.service'
import { KnowledgeOcrService } from './composables/knowledge-ocr.service'
import { KnowledgeQaService } from './composables/knowledge-qa.service'
import { KnowledgeQueryAnalysisService } from './composables/knowledge-query-analysis.service'
import { KnowledgeQueryEngineService } from './composables/knowledge-query-engine.service'
import { KnowledgeRetrievalService } from './composables/knowledge-retrieval.service'
import { KnowledgeVectorStoreService } from './composables/knowledge-vector-store.service'
import { KnowledgeController } from './knowledge.controller'
import { KnowledgeBaseEntity } from './entity/knowledge-base.entity'
import { KnowledgeChunkEntity } from './entity/knowledge-chunk.entity'
import { KnowledgeDocumentEntity } from './entity/knowledge-document.entity'
import { KnowledgeRuntimeSettingsEntity } from './entity/knowledge-runtime-settings.entity'
import { KnowledgeService } from './knowledge.service'

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
    KnowledgeService,
    KnowledgeFileService,
    KnowledgeBm25Service,
    KnowledgeQueryAnalysisService,
    KnowledgeQueryEngineService,
    KnowledgeRetrievalService,
    KnowledgeOcrService,
    EmbeddingService,
    KnowledgeVectorStoreService,
    KnowledgeQaService
  ],
  exports: [
    KnowledgeService,
    KnowledgeQueryEngineService,
    KnowledgeOcrService,
    EmbeddingService,
    KnowledgeVectorStoreService,
    KnowledgeQaService
  ]
})
export class KnowledgeModule {}
