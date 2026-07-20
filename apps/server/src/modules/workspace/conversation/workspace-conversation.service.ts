import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  CreateWorkspaceConversationInput,
  WorkspaceConversationPage,
  WorkspaceConversationSummary,
  WorkspaceMessage
} from 'share-type'
import { WorkspaceConversationEntity } from '../entity/workspace-conversation.entity'
import { WorkspaceMessageEntity } from '../entity/workspace-message.entity'

@Injectable()
export class WorkspaceConversationService {
  constructor(
    @InjectRepository(WorkspaceConversationEntity)
    private readonly conversationRepo: Repository<WorkspaceConversationEntity>,
    @InjectRepository(WorkspaceMessageEntity)
    private readonly messageRepo: Repository<WorkspaceMessageEntity>
  ) {}

  async findConversations(page: number, limit: number): Promise<WorkspaceConversationPage> {
     const [items,total] = await this.conversationRepo.findAndCount({
      order:{updatedAt:'DESC'},
      skip:(page-1)*limit,
      take:limit
     })
     return {
          items:items.map(toWorkspaceConversationSummary),
          total,
          hasMore:page*limit < total
     }
  }

  async createConversation(
    input: CreateWorkspaceConversationInput
  ): Promise<WorkspaceConversationSummary> {
    const created = await this.conversationRepo.save(
      this.conversationRepo.create({ title: normalizeTitle(input.title), model: null })
    )
    return toWorkspaceConversationSummary(created)
  }

  async deleteConversation(conversationId: string): Promise<WorkspaceConversationSummary> {
    const conversation = await this.findEntity(conversationId)
    await this.conversationRepo.remove(conversation)
    return toWorkspaceConversationSummary(conversation)
  }

  async findConversationMessages(conversationId: string): Promise<WorkspaceMessage[]> {
    await this.findEntity(conversationId)
    const items = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' }
    })
    return items.map(toWorkspaceMessage)
  }

  async resolve(conversationId: string | undefined, query: string): Promise<WorkspaceConversationEntity> {
    if (conversationId) {
      return this.findEntity(conversationId)
    }
    return this.conversationRepo.save(
      this.conversationRepo.create({ title: buildConversationTitle(query), model: null })
    )
  }

  async refresh(
    conversation: WorkspaceConversationEntity,
    patch: { title: string; model: string | null }
  ): Promise<WorkspaceConversationEntity> {
    conversation.title = patch.title
    conversation.model = patch.model
    conversation.messageCount = await this.messageRepo.count({
      where: { conversationId: conversation.id }
    })
    return this.conversationRepo.save(conversation)
  }

  async findEntity(conversationId: string): Promise<WorkspaceConversationEntity> {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } })
    if (!conversation) {
      throw new NotFoundException('Conversation not found')
    }
    return conversation
  }
}

export function buildConversationTitle(query: string): string {
  const normalized = query.replace(/\s+/g, ' ').trim()
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || '新对话'
}

export function toWorkspaceConversationSummary(
  entity: WorkspaceConversationEntity
): WorkspaceConversationSummary {
  return {
    id: entity.id,
    title: entity.title,
    updatedAt: entity.updatedAt.toISOString(),
    messageCount: entity.messageCount,
    model: entity.model
  }
}

function normalizeTitle(value?: string): string {
  return value?.trim() || '新对话'
}

function toWorkspaceMessage(entity: WorkspaceMessageEntity): WorkspaceMessage {
  return {
    id: entity.id,
    conversationId: entity.conversationId,
    role: entity.role,
    content: entity.content,
    createdAt: entity.createdAt.toISOString(),
    citations: entity.citations,
    retrievalDebug: entity.retrievalDebug,
    model: entity.model,
    latencyMs: entity.latencyMs,
    totalTokens: entity.totalTokens,
    reasoningSteps: entity.reasoningSteps,
    promptCapabilities: entity.promptCapabilities
  }
}
