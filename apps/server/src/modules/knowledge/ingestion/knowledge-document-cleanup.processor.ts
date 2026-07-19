import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Job } from 'bullmq'
import { Repository } from 'typeorm'
import { KnowledgeDocumentEntity } from '../entity/knowledge-document.entity'
import { KNOWLEDGE_DOCUMENT_CLEANUP_QUEUE } from './knowledge-document.service'

@Processor(KNOWLEDGE_DOCUMENT_CLEANUP_QUEUE)
export class KnowledgeDocumentCleanupProcessor extends WorkerHost {
  constructor(
    @InjectRepository(KnowledgeDocumentEntity)
    private readonly documentRepo: Repository<KnowledgeDocumentEntity>
  ) {
    super()
  }

  async process(job: Job<{ documentId: string }>): Promise<void> {
    await this.documentRepo.delete({ id: job.data.documentId, status: 'inactive' })
  }
}
