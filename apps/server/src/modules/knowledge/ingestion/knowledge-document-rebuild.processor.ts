import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import {
  KnowledgeDocumentService,
  KNOWLEDGE_DOCUMENT_REBUILD_QUEUE
} from './knowledge-document.service'

@Processor(KNOWLEDGE_DOCUMENT_REBUILD_QUEUE)
export class KnowledgeDocumentRebuildProcessor extends WorkerHost {
  constructor(private readonly documentService: KnowledgeDocumentService) {
    super()
  }

  async process(job: Job<{ documentId: string }>): Promise<void> {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
    await this.documentService.processDocumentRebuild(job.data.documentId, finalAttempt)
  }
}
