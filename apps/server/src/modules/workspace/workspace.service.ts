import { Injectable } from '@nestjs/common'
import { KnowledgeService } from '../knowledge/knowledge.service'
import { WorkspaceChatDto } from './dto/workspace.dto'
import type { KnowledgeAskResult } from 'share-type/knowledge'

@Injectable()
export class WorkspaceService {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  async chat(dto: WorkspaceChatDto): Promise<KnowledgeAskResult> {
    return this.knowledgeService.askKnowledge({
      query: dto.query,
      knowledgeBaseId: dto.knowledgeBaseId,
      topK: 4
    })
  }
}
