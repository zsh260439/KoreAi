import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  KnowledgeReasoningStep,
  KnowledgeSearchDebugInfo,
  KnowledgeSearchHit,
  WorkspaceChatInput,
  WorkspaceChatResult,
  WorkspaceChatStreamEvent,
  WorkspacePromptCapabilities
} from 'share-type'
import { KnowledgeQueryService } from '../../knowledge/query/knowledge-query.service'
import {
  buildConversationTitle,
  toWorkspaceConversationSummary,
  WorkspaceConversationService
} from '../conversation/workspace-conversation.service'
import { WorkspaceConversationEntity } from '../entity/workspace-conversation.entity'
import { WorkspaceMessageEntity } from '../entity/workspace-message.entity'

const KNOWLEDGE_RECALL_STAGE_ID = 'knowledge-recall'
const VISIBLE_REASONING_STAGE_ID = 'visible-reasoning'
const ANSWER_SYNTHESIS_STAGE_ID = 'answer-synthesis'

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
  retrievalDebug: KnowledgeSearchDebugInfo | null
  model: string | null
  reasoningSteps: KnowledgeReasoningStep[] | null
  latencyMs: number
  totalTokens: number | null
}

@Injectable()
export class WorkspaceChatService {
  constructor(
    @InjectRepository(WorkspaceMessageEntity)
    private readonly messageRepo: Repository<WorkspaceMessageEntity>,
    private readonly conversationService: WorkspaceConversationService,
    private readonly knowledgeQueryService: KnowledgeQueryService
  ) {}

  async *chatStream(
    dto: WorkspaceChatInput,
    options: { signal?: AbortSignal } = {}
  ): AsyncGenerator<WorkspaceChatStreamEvent> {
    const context = await this.prepareChatContext(dto)
    const startedAt = Date.now()

    yield stageStarted(
      KNOWLEDGE_RECALL_STAGE_ID,
      'knowledge_recall',
      '检索知识库',
      '正在定位与问题相关的文档片段'
    )

    const answerStream = await this.knowledgeQueryService.streamAnswer(
      {
        query: context.query,
        knowledgeBaseId: dto.knowledgeBaseId,
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
        sources: answerStream.sources,
        retrievalDebug: answerStream.retrievalDebug
      }
    }
    yield {
      type: 'stage_completed',
      data: {
        stageId: KNOWLEDGE_RECALL_STAGE_ID,
        subtitle: answerStream.sources.length
          ? `已命中 ${answerStream.sources.length} 个 chunk`
          : '没有命中可引用的知识库片段'
      }
    }

    let reasoningStageStarted = context.promptCapabilities.think
    let hasReasoningContent = false
    let answerStageStarted = false

    if (reasoningStageStarted) {
      yield stageStarted(
        VISIBLE_REASONING_STAGE_ID,
        'llm_reasoning',
        '分析问题与证据',
        '正在整理可展示的推理摘要'
      )
    }

    for await (const event of answerStream.stream) {
      if (options.signal?.aborted) {
        return
      }

      if (event.type === 'thinking_delta') {
        hasReasoningContent = true
        appendReasoningDelta(reasoningSteps, event.delta)
        yield event
        continue
      }

      if (reasoningStageStarted) {
        reasoningStageStarted = false
        yield stageCompleted(
          VISIBLE_REASONING_STAGE_ID,
          hasReasoningContent ? '已形成可展示推理摘要' : '未返回可展示推理摘要'
        )
      }
      if (!answerStageStarted) {
        answerStageStarted = true
        yield stageStarted(
          ANSWER_SYNTHESIS_STAGE_ID,
          'answer_synthesis',
          '组织最终回答',
          '正在输出面向用户的完整回答'
        )
      }
      answer += event.delta
      yield event
    }

    if (answerStageStarted) {
      yield stageCompleted(ANSWER_SYNTHESIS_STAGE_ID, '最终回答已生成')
    }

    const finalAnswer = answer.trim()
    if (!finalAnswer) {
      throw new BadRequestException(
        context.promptCapabilities.think
          ? '思考模式未生成最终答案，请重新生成'
          : '本次回答未生成有效内容，请重新生成'
      )
    }

    const result = await this.persistAssistantResponse({
      conversation: context.conversation,
      query: context.query,
      promptCapabilities: context.promptCapabilities,
      answer: finalAnswer,
      sources: answerStream.sources,
      retrievalDebug: answerStream.retrievalDebug,
      model: answerStream.model,
      reasoningSteps: normalizeReasoningSteps(reasoningSteps),
      latencyMs: Date.now() - startedAt,
      totalTokens: await answerStream.totalTokens
    })
    yield { type: 'completed', data: result }
  }

  private async prepareChatContext(dto: WorkspaceChatInput): Promise<PreparedChatContext> {
    const incomingQuery = dto.query.trim()
    if (!incomingQuery) {
      throw new BadRequestException('query cannot be empty')
    }

    const conversation = await this.conversationService.resolve(dto.conversationId, incomingQuery)
    const promptCapabilities = buildPromptCapabilities(dto.think, dto.rewrite)
    if (dto.regenerate) {
      return {
        conversation,
        promptCapabilities,
        query: await this.prepareRegenerate(conversation.id)
      }
    }

    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId: conversation.id,
        role: 'user',
        content: incomingQuery,
        citations: null,
        retrievalDebug: null,
        model: null,
        latencyMs: null,
        totalTokens: null,
        reasoningSteps: null,
        promptCapabilities
      })
    )
    await this.conversationService.refresh(conversation, {
      title: conversation.messageCount === 0 ? buildConversationTitle(incomingQuery) : conversation.title,
      model: conversation.model
    })

    return { conversation, promptCapabilities, query: incomingQuery }
  }

  private async persistAssistantResponse(
    input: PersistAssistantResponseInput
  ): Promise<WorkspaceChatResult> {
    await this.messageRepo.save(
      this.messageRepo.create({
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
    const conversation = await this.conversationService.refresh(input.conversation, {
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
      conversationId: conversation.id,
      conversation: toWorkspaceConversationSummary(conversation),
      latencyMs: input.latencyMs,
      totalTokens: input.totalTokens
    }
  }

  private async prepareRegenerate(conversationId: string): Promise<string> {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' }
    })
    const lastUserMessage = [...messages].reverse().find(({ role }) => role === 'user')
    if (!lastUserMessage) {
      throw new BadRequestException('No user message found for regenerate')
    }

    const lastMessage = messages.at(-1)
    if (lastMessage?.role === 'assistant') {
      await this.messageRepo.delete({ id: lastMessage.id })
    }
    return lastUserMessage.content
  }
}

function buildPromptCapabilities(think?: boolean, rewrite?: boolean): WorkspacePromptCapabilities {
  return { think: Boolean(think), rewrite: rewrite !== false }
}

function normalizeReasoningSteps(
  reasoningSteps: KnowledgeReasoningStep[]
): KnowledgeReasoningStep[] | null {
  const items = reasoningSteps
    .map((step) => ({ ...step, content: step.content.trim() }))
    .filter(({ content }) => content)
  return items.length ? items : null
}

function appendReasoningDelta(steps: KnowledgeReasoningStep[], delta: string): void {
  steps[0] ??= { stageKey: 'llm_reasoning', title: '分析问题与证据', content: '' }
  steps[0].content += delta
}

function stageStarted(
  id: string,
  stageKey: 'knowledge_recall' | 'llm_reasoning' | 'answer_synthesis',
  title: string,
  subtitle: string
): WorkspaceChatStreamEvent {
  return { type: 'stage_started', data: { id, stageKey, title, subtitle, status: 'running' } }
}

function stageCompleted(stageId: string, subtitle: string): WorkspaceChatStreamEvent {
  return { type: 'stage_completed', data: { stageId, subtitle } }
}
