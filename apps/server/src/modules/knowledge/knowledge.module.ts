import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { KnowledgeController } from './knowledge.controller'
import { KnowledgeService } from './knowledge.service'
import { EmbeddingService } from './composables/embedding.service'
import { KnowledgeVectorStoreService } from './composables/knowledge-vector-store.service'
import { KnowledgeBaseEntity } from './entity/knowledge-base.entity'
import { KnowledgeDocumentEntity } from './entity/knowledge-document.entity'
import { KnowledgeChunkEntity } from './entity/knowledge-chunk.entity'
import { KnowledgeQaService } from './composables/knowledge-qa.service'
@Module({
  imports:[
    TypeOrmModule.forFeature([
      KnowledgeBaseEntity,
      KnowledgeDocumentEntity,
      KnowledgeChunkEntity,
    ])
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, EmbeddingService, KnowledgeVectorStoreService, KnowledgeQaService],
  exports: [KnowledgeService, EmbeddingService, KnowledgeVectorStoreService, KnowledgeQaService]
})
export class KnowledgeModule {}
