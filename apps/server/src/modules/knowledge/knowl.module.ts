import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { KnowledgeController } from './knowledge.controller'
import { KnowledgeService } from './knowledge.service'
import { KnowledgeBaseEntity } from './entity/knowledge-base.entity'
import { KnowledgeDocumentEntity } from './entity/knowledge-document.entity'
import { KnowledgeChunkEntity } from './entity/knowledge-chunk.entity'

@Module({
  imports:[
    TypeOrmModule.forFeature([
      KnowledgeBaseEntity,
      KnowledgeDocumentEntity,
      KnowledgeChunkEntity,
    ])
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService]
})
export class KnowledgeModule {}
