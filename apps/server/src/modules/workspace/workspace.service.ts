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
  totalTokens: number | null
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
  //返回所有对话记录
  async findConversations(): Promise<WorkspaceConversationSummary[]> {
    const items = await this.workspaceConversationRepo.find({
      order: { updatedAt: 'DESC' }
    })

    return items.map(toWorkspaceConversationSummary)
  }
  //创建对话记录
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

  //声明删除指定对话记录
  async deleteConversation(conversationId: string): Promise<WorkspaceConversationSummary> {
    const conversation = await this.findConversationEntity(conversationId)
    const summary = toWorkspaceConversationSummary(conversation)
    await this.workspaceConversationRepo.remove(conversation)
    return summary
  }

  //返回指定对话记录的所有消息
  async findConversationMessages(conversationId: string): Promise<WorkspaceMessage[]> {
    await this.findConversationEntity(conversationId)

    const items = await this.workspaceMessageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' }
    })

    return items.map(toWorkspaceMessage)
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
        case 'thinking_delta':
          appendReasoningDelta(reasoningSteps, event.delta)
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
    const totalTokens = await streamResult.totalTokens
    //声明流式结束后统一校验最终答案不能为空，避免落库空 assistant 消息
    const finalAnswer = answer.trim()
    if (!finalAnswer) {
      throw new BadRequestException(
        context.promptCapabilities.think
          ? '思考模式未生成最终答案，请重新生成'
          : '本次回答未生成有效内容，请重新生成'
      )
    }

    const finalResult = await this.persistAssistantResponse({
      conversation: context.conversation,
      query: context.query,
      promptCapabilities: context.promptCapabilities,
      answer: finalAnswer,
      sources: streamResult.sources,
      model: streamResult.model,
      reasoningSteps: normalizePersistedReasoningSteps(reasoningSteps),
      latencyMs,
      totalTokens
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
          totalTokens: null,
          reasoningSteps: null,
          promptCapabilities
        })
      )
      //声明用户消息保存完成后立即刷新会话消息数与首轮标题
      await this.refreshConversation(conversation.id, {
        title: conversation.messageCount === 0 ? buildConversationTitle(query) : conversation.title,
        model: conversation.model
      })
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
        totalTokens: input.totalTokens,
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
      latencyMs: input.latencyMs,
      totalTokens: input.totalTokens
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

  //刷新会话基础信息
  private async refreshConversation(
    conversationId: string,
    patch: {
      title: string
      model: string | null
    }
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

//声明思考增量聚合逻辑
function appendReasoningDelta(reasoningSteps: KnowledgeReasoningStep[], delta: string): void {
  if (!delta) {
    return
  }

  if (!reasoningSteps[0]) {
    reasoningSteps[0] = {
      stageKey: 'llm_reasoning',
      title: '思考过程',
      content: ''
    }
  }

  reasoningSteps[0].content += delta
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
    totalTokens: entity.totalTokens,
    reasoningSteps: entity.reasoningSteps,
    promptCapabilities: entity.promptCapabilities
  }
}
