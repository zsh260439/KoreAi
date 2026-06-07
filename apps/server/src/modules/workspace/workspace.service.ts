import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  CreateWorkspaceConversationInput,
  KnowledgeReasoningStep,
  KnowledgeSearchHit,
  WorkspaceChatInput,
  WorkspaceChatResult,
  WorkspaceChatStreamEvent,
  WorkspaceConversationSummary,
  WorkspaceMessage,
  WorkspacePromptCapabilities
} from 'share-type'
import { KnowledgeService } from '../knowledge/knowledge.service'
import { WorkspaceConversationEntity } from './entity/workspace-conversation.entity'
import { WorkspaceMessageEntity } from './entity/workspace-message.entity'

type PreparedChatContext = {
  conversation: WorkspaceConversationEntity
  promptCapabilities: WorkspacePromptCapabilities
  query: string
}

type PersistAssistantResponseInput = {
  conversation: WorkspaceConversationEntity
  query: string
  promptCapabilities: WorkspacePromptCapabilities
  answer: string
  sources: KnowledgeSearchHit[]
  model: string | null
  reasoningSteps: KnowledgeReasoningStep[] | null
  latencyMs: number
}

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(WorkspaceConversationEntity)
    private readonly workspaceConversationRepo: Repository<WorkspaceConversationEntity>,
    @InjectRepository(WorkspaceMessageEntity)
    private readonly workspaceMessageRepo: Repository<WorkspaceMessageEntity>,
    private readonly knowledgeService: KnowledgeService
  ) {}

  async findConversations(): Promise<WorkspaceConversationSummary[]> {
    const items = await this.workspaceConversationRepo.find({
      order: { updatedAt: 'DESC' }
    })

    return items.map(toWorkspaceConversationSummary)
  }

  async createConversation(
    dto: CreateWorkspaceConversationInput
  ): Promise<WorkspaceConversationSummary> {
    const title = normalizeConversationTitle(dto.title)
    const entity = this.workspaceConversationRepo.create({
      title,
      model: null
    })

    const created = await this.workspaceConversationRepo.save(entity)
    return toWorkspaceConversationSummary(created)
  }

  async findConversationMessages(conversationId: string): Promise<WorkspaceMessage[]> {
    await this.findConversationEntity(conversationId)

    const items = await this.workspaceMessageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' }
    })

    return items.map(toWorkspaceMessage)
  }

  async chat(dto: WorkspaceChatInput): Promise<WorkspaceChatResult> {
    const context = await this.prepareChatContext(dto)
    const startedAt = Date.now()
    const result = await this.knowledgeService.askKnowledge({
      query: context.query,
      knowledgeBaseId: dto.knowledgeBaseId,
      topK: 4,
      think: dto.think
    })
    const latencyMs = Date.now() - startedAt

    return this.persistAssistantResponse({
      conversation: context.conversation,
      query: context.query,
      promptCapabilities: context.promptCapabilities,
      answer: result.answer,
      sources: result.sources,
      model: result.model,
      reasoningSteps: result.reasoningSteps,
      latencyMs
    })
  }

  async *chatStream(
    dto: WorkspaceChatInput,
    options: { signal?: AbortSignal } = {}
  ): AsyncGenerator<WorkspaceChatStreamEvent> {
    const context = await this.prepareChatContext(dto)
    const startedAt = Date.now()
    const streamResult = await this.knowledgeService.streamAskKnowledge(
      {
        query: context.query,
        knowledgeBaseId: dto.knowledgeBaseId,
        topK: 4,
        think: dto.think
      },
      { signal: options.signal }
    )

    const reasoningSteps: KnowledgeReasoningStep[] = []
    let answer = ''

    for await (const event of streamResult.stream) {
      if (options.signal?.aborted) {
        return
      }

      switch (event.type) {
        case 'reasoning_step_started':
          reasoningSteps[event.index] = {
            ...event.step,
            content: ''
          }
          yield event
          break
        case 'reasoning_step_delta':
          if (!reasoningSteps[event.index]) {
            reasoningSteps[event.index] = {
              stageKey: event.index === 0 ? 'deepsearch' : 'llm_reasoning',
              title: event.index === 0 ? 'Analyze the Request' : 'Synthesize the Answer',
              content: ''
            }
          }

          reasoningSteps[event.index].content += event.delta
          yield event
          break
        case 'reasoning_step_completed':
          if (reasoningSteps[event.index]) {
            reasoningSteps[event.index].content = event.content
          }
          yield event
          break
        case 'answer_delta':
          answer += event.delta
          yield event
          break
      }
    }

    if (options.signal?.aborted) {
      return
    }

    const latencyMs = Date.now() - startedAt
    const finalResult = await this.persistAssistantResponse({
      conversation: context.conversation,
      query: context.query,
      promptCapabilities: context.promptCapabilities,
      answer: answer.trim(),
      sources: streamResult.sources,
      model: streamResult.model,
      reasoningSteps: normalizePersistedReasoningSteps(reasoningSteps),
      latencyMs
    })

    yield {
      type: 'completed',
      data: finalResult
    }
  }

  private async prepareChatContext(dto: WorkspaceChatInput): Promise<PreparedChatContext> {
    const incomingQuery = dto.query.trim()
    if (!incomingQuery) {
      throw new BadRequestException('query cannot be empty')
    }

    const conversation = dto.conversationId
      ? await this.findConversationEntity(dto.conversationId)
      : await this.workspaceConversationRepo.save(
          this.workspaceConversationRepo.create({
            title: buildConversationTitle(incomingQuery),
            model: null
          })
        )

    const promptCapabilities = buildPromptCapabilities(dto.think)
    const query = dto.regenerate
      ? await this.prepareConversationRegenerate(conversation.id)
      : incomingQuery

    if (!dto.regenerate) {
      await this.workspaceMessageRepo.save(
        this.workspaceMessageRepo.create({
          conversationId: conversation.id,
          role: 'user',
          content: query,
          citations: null,
          model: null,
          latencyMs: null,
          reasoningSteps: null,
          promptCapabilities
        })
      )
    }

    return {
      conversation,
      promptCapabilities,
      query
    }
  }

  private async persistAssistantResponse(
    input: PersistAssistantResponseInput
  ): Promise<WorkspaceChatResult> {
    await this.workspaceMessageRepo.save(
      this.workspaceMessageRepo.create({
        conversationId: input.conversation.id,
        role: 'assistant',
        content: input.answer,
        citations: input.sources,
        model: input.model,
        latencyMs: input.latencyMs,
        reasoningSteps: input.reasoningSteps,
        promptCapabilities: input.promptCapabilities
      })
    )

    const updatedConversation = await this.refreshConversation(input.conversation.id, {
      title:
        input.conversation.messageCount === 0
          ? buildConversationTitle(input.query)
          : input.conversation.title,
      model: input.model
    })

    return {
      answer: input.answer,
      sources: input.sources,
      model: input.model,
      reasoningSteps: input.reasoningSteps,
      conversationId: input.conversation.id,
      conversation: toWorkspaceConversationSummary(updatedConversation),
      latencyMs: input.latencyMs
    }
  }

  private async prepareConversationRegenerate(conversationId: string): Promise<string> {
    const messages = await this.workspaceMessageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' }
    })

    const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user')
    if (!lastUserMessage) {
      throw new BadRequestException('No user message found for regenerate')
    }

    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'assistant') {
      await this.workspaceMessageRepo.delete({ id: lastMessage.id })
    }

    return lastUserMessage.content
  }

  private async refreshConversation(
    conversationId: string,
    patch: Pick<WorkspaceConversationEntity, 'title' | 'model'>
  ): Promise<WorkspaceConversationEntity> {
    const conversation = await this.findConversationEntity(conversationId)
    const messageCount = await this.workspaceMessageRepo.count({
      where: { conversationId }
    })

    conversation.title = patch.title
    conversation.model = patch.model
    conversation.messageCount = messageCount

    return this.workspaceConversationRepo.save(conversation)
  }

  private async findConversationEntity(conversationId: string): Promise<WorkspaceConversationEntity> {
    const conversation = await this.workspaceConversationRepo.findOne({
      where: { id: conversationId }
    })

    if (!conversation) {
      throw new NotFoundException('Conversation not found')
    }

    return conversation
  }
}

function normalizeConversationTitle(value?: string): string {
  const title = value?.trim()
  return title || '\u65b0\u5bf9\u8bdd'
}

function buildConversationTitle(query: string): string {
  const normalized = query.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '\u65b0\u5bf9\u8bdd'
  }

  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized
}

function buildPromptCapabilities(think?: boolean): WorkspacePromptCapabilities {
  return {
    think: Boolean(think),
    search: false
  }
}

function normalizePersistedReasoningSteps(
  reasoningSteps: KnowledgeReasoningStep[]
): KnowledgeReasoningStep[] | null {
  const items = reasoningSteps
    .map((step) => ({
      ...step,
      content: step.content.trim()
    }))
    .filter((step) => step.content)

  return items.length ? items : null
}

function toWorkspaceConversationSummary(
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

function toWorkspaceMessage(entity: WorkspaceMessageEntity): WorkspaceMessage {
  return {
    id: entity.id,
    conversationId: entity.conversationId,
    role: entity.role,
    content: entity.content,
    createdAt: entity.createdAt.toISOString(),
    citations: entity.citations,
    model: entity.model,
    latencyMs: entity.latencyMs,
    reasoningSteps: entity.reasoningSteps,
    promptCapabilities: entity.promptCapabilities
  }
}
