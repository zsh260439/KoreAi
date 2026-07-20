import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { DataSource, LessThanOrEqual } from 'typeorm'
import { KnowledgeDocumentEntity } from '../entity/knowledge-document.entity'
import { KnowledgeDocumentRevisionEntity } from '../entity/knowledge-document-revision.entity'
import { KNOWLEDGE_DOCUMENT_CLEANUP_QUEUE } from './knowledge-document.service'

@Processor(KNOWLEDGE_DOCUMENT_CLEANUP_QUEUE)
export class KnowledgeDocumentCleanupProcessor extends WorkerHost {
  constructor(
    private readonly dataSource: DataSource
  ) {
    super()
  }

  async process(job: Job<{ documentId: string; revisionId?: string }>): Promise<void> {
    const { documentId, revisionId } = job.data
    if (!revisionId) {
      await this.dataSource.getRepository(KnowledgeDocumentEntity).delete({
        id: documentId,
        status: 'inactive'
      })
      return
    }

    await this.dataSource.transaction(async (manager) => {
      const document = await manager.findOne(KnowledgeDocumentEntity, {
        where: { id: documentId },
        lock: { mode: 'pessimistic_write' }
      })
      if (!document || !canDeleteRevision(document.activeRevisionId, revisionId)) return
      await manager.delete(KnowledgeDocumentRevisionEntity, {
        id: revisionId,
        documentId,
        expiresAt: LessThanOrEqual(new Date())
      })
    })
  }
}

export const canDeleteRevision = (activeRevisionId: string | null, revisionId: string): boolean =>
  activeRevisionId !== revisionId
