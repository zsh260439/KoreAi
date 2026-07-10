import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  CreateWorkspaceConversationInput,
  KnowledgeBaseRuntimeConfig,
  KnowledgeSearchDebugInfo,
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

const KNOWLEDGE_RECALL_STAGE_ID = 'knowledge-recall'
const VISIBLE_REASONING_STAGE_ID = 'visible-reasoning'
const ANSWER_SYNTHESIS_STAGE_ID = 'answer-synthesis'

type PreparedChatContext = {
  conversation: WorkspaceConversationEntity
  promptCapabilities: WorkspacePromptCapabilities
  query: string
  runtimeConfig: KnowledgeBaseRuntimeConfig
}

type PersistAssistantResponseInput = {
  conversation: WorkspaceConversationEntity
  query: string
  promptCapabilities: WorkspacePromptCapabilities
  answer: string
  sources: KnowledgeSearchHit[]
  retrievalDebug: KnowledgeSearchDebugInfo | null
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

  async findConversations(): Promise<WorkspaceConversationSummary[]> {
    const items = await this.workspaceConversationRepo.find({
      order: { updatedAt: 'DESC' }
    })

    return items.map(toWorkspaceConversationSummary)
  }

  async createConversation(
    dto: CreateWorkspaceConversationInput
  ): Promise<WorkspaceConversationSummary> {
    const entity = this.workspaceConversationRepo.create({
      title: normalizeConversationTitle(dto.title),
      model: null
    })

    const created = await this.workspaceConversationRepo.save(entity)
    return toWorkspaceConversationSummary(created)
  }

  async deleteConversation(conversationId: string): Promise<WorkspaceConversationSummary> {
    const conversation = await this.findConversationEntity(conversationId)
    const summary = toWorkspaceConversationSummary(conversation)
    await this.workspaceConversationRepo.remove(conversation)
    return summary
  }

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

    yield {
      type: 'stage_started',
      data: {
        id: KNOWLEDGE_RECALL_STAGE_ID,
        stageKey: 'knowledge_recall',
        title: '检索知识库',
        subtitle: '正在定位与问题相关的文档片段',
        status: 'running'
      }
    }

    const streamResult = await this.knowledgeService.streamAskKnowledge(
      {
        query: context.query,
        knowledgeBaseId: dto.knowledgeBaseId,
        topK: context.runtimeConfig.retrieval.workspaceTopK,
        think: dto.think,
        rewrite: context.promptCapabilities.rewrite
      },
      { signal: options.signal }
    )

    const reasoningSteps: KnowledgeReasoningStep[] = []
    let answer = ''

    yield {
      type: 'sources',
      data: {
        sources: streamResult.sources,
        retrievalDebug: streamResult.retrievalDebug
      }
    }

    yield {
      type: 'stage_completed',
      data: {
        stageId: KNOWLEDGE_RECALL_STAGE_ID,
        subtitle: streamResult.sources.length
          ? `已命中 ${streamResult.sources.length} 个 chunk`
          : '没有命中可引用的知识库片段'
      }
    }

    let reasoningStageStarted = false
    let answerStageStarted = false

    for await (const event of streamResult.stream) {
      if (options.signal?.aborted) {
        return
      }

      switch (event.type) {
        case 'thinking_delta':
          if (!reasoningStageStarted) {
            reasoningStageStarted = true
            yield {
              type: 'stage_started',
              data: {
                id: VISIBLE_REASONING_STAGE_ID,
                stageKey: 'llm_reasoning',
                title: '分析问题与证据',
                subtitle: '正在整理可展示的推理摘要',
                status: 'running'
              }
            }
          }
          appendReasoningDelta(reasoningSteps, event.delta)
          yield event
          break
        case 'answer_delta':
          if (reasoningStageStarted) {
            reasoningStageStarted = false
            yield {
              type: 'stage_completed',
              data: {
                stageId: VISIBLE_REASONING_STAGE_ID,
                subtitle: '已形成可展示推理摘要'
              }
            }
          }

          if (!answerStageStarted) {
            answerStageStarted = true
            yield {
              type: 'stage_started',
              data: {
                id: ANSWER_SYNTHESIS_STAGE_ID,
                stageKey: 'answer_synthesis',
                title: '组织最终回答',
                subtitle: '正在输出面向用户的完整回答',
                status: 'running'
              }
            }
          }
          answer += event.delta
          yield event
          break
      }
    }

    if (answerStageStarted) {
      yield {
        type: 'stage_completed',
        data: {
          stageId: ANSWER_SYNTHESIS_STAGE_ID,
          subtitle: '最终回答已生成'
        }
      }
    }

    const latencyMs = Date.now() - startedAt
    const totalTokens = await streamResult.totalTokens
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
      retrievalDebug: streamResult.retrievalDebug,
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

    const promptCapabilities = buildPromptCapabilities(dto.think, dto.rewrite)
    let query = incomingQuery

    if (dto.regenerate) {
      query = await this.prepareConversationRegenerate(conversation.id)
    } else {
      await this.workspaceMessageRepo.save(
        this.workspaceMessageRepo.create({
          conversationId: conversation.id,
          role: 'user',
          content: query,
          citations: null,
          retrievalDebug: null,
          model: null,
          latencyMs: null,
          totalTokens: null,
          reasoningSteps: null,
          promptCapabilities
        })
      )

      await this.refreshConversation(conversation, {
        title: conversation.messageCount === 0 ? buildConversationTitle(query) : conversation.title,
        model: conversation.model
      })
    }

    return {
      conversation,
      promptCapabilities,
      query,
      runtimeConfig: await this.knowledgeService.findKnowledgeBaseRuntimeConfig(dto.knowledgeBaseId)
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
        retrievalDebug: input.retrievalDebug,
        model: input.model,
        latencyMs: input.latencyMs,
        totalTokens: input.totalTokens,
        reasoningSteps: input.reasoningSteps,
        promptCapabilities: input.promptCapabilities
      })
    )

    const updatedConversation = await this.refreshConversation(input.conversation, {
      title:
        input.conversation.messageCount === 0
          ? buildConversationTitle(input.query)
          : input.conversation.title,
      model: input.model
    })

    return {
      answer: input.answer,
      sources: input.sources,
      retrievalDebug: input.retrievalDebug,
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
    if (lastMessage.role === 'assistant') {
      await this.workspaceMessageRepo.delete({ id: lastMessage.id })
    }

    return lastUserMessage.content
  }

  private async refreshConversation(
    conversation: WorkspaceConversationEntity,
    patch: {
      title: string
      model: string | null
    }
  ): Promise<WorkspaceConversationEntity> {
    const messageCount = await this.workspaceMessageRepo.count({
      where: { conversationId: conversation.id }
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
  return title || '新对话'
}

function buildConversationTitle(query: string): string {
  const normalized = query.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '新对话'
  }

  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized
}

function buildPromptCapabilities(
  think?: boolean,
  rewrite?: boolean
): WorkspacePromptCapabilities {
  return {
    think: Boolean(think),
    rewrite: rewrite !== false
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

function appendReasoningDelta(reasoningSteps: KnowledgeReasoningStep[], delta: string): void {
  if (!reasoningSteps[0]) {
    reasoningSteps[0] = {
      stageKey: 'llm_reasoning',
      title: '分析问题与证据',
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
    retrievalDebug: entity.retrievalDebug,
    model: entity.model,
    latencyMs: entity.latencyMs,
    totalTokens: entity.totalTokens,
    reasoningSteps: entity.reasoningSteps,
    promptCapabilities: entity.promptCapabilities
  }
}
