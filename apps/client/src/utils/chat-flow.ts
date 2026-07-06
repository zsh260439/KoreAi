import type { AssistantResponseFlow, AssistantThinkingStage } from '@/types/chat/flow'
import type { ChatMessage, ChatMessageStatus, ChatRole } from '@/types/chat/models'
import type {
  KnowledgeReasoningStep,
  KnowledgeSearchHit,
  WorkspaceRunStage,
  WorkspacePromptCapabilities
} from 'share-type'

// 带推理步骤的聊天消息
interface ChatMessageWithThinking {
  id: string
  conversationId: string
  role: ChatRole
  content: string
  createdAt: string
  citations: KnowledgeSearchHit[] | null
  model: string | null
  latencyMs: number | null
  totalTokens: number | null
  reasoningSteps: KnowledgeReasoningStep[]
  status: ChatMessageStatus
  responseFlow?: AssistantResponseFlow
  promptCapabilities?: WorkspacePromptCapabilities | null
}

// 最终回答标题
const FINAL_ANSWER_TITLE = '\u6700\u7ec8\u56de\u7b54'

const KNOWLEDGE_RECALL_STAGE_ID = 'knowledge-recall'
const VISIBLE_REASONING_STAGE_ID = 'visible-reasoning'
const ANSWER_SYNTHESIS_STAGE_ID = 'answer-synthesis'

const buildKnowledgeRecallStage = (
  messageId: string,
  sources: KnowledgeSearchHit[]
): AssistantThinkingStage[] => {
  if (!sources.length) {
    return []
  }

  return [{
    kind: 'process',
    id: `${messageId}-${KNOWLEDGE_RECALL_STAGE_ID}`,
    stageKey: 'knowledge_recall',
    title: '检索知识库',
    subtitle: `已命中 ${sources.length} 个 chunk`,
    status: 'done',
    content: '',
    visibleContent: ''
  }]
}

// 判断是否需要渲染思考过程
const shouldRenderThinking = (message: ChatMessage): message is ChatMessageWithThinking =>
  Boolean(message.promptCapabilities?.think) && Array.isArray(message.reasoningSteps)

//声明历史推理步骤构造逻辑
const buildThinkingStages = (message: ChatMessage): AssistantThinkingStage[] => {
  if (!shouldRenderThinking(message)) {
    return []
  }

  return message.reasoningSteps
    .flatMap((step, index) => {
      const content = step.content.trim()
      if (!content) {
        return []
      }

      return [{
        kind: 'process' as const,
        id: `${message.id}-${step.stageKey}-${index}`,
        stageKey: step.stageKey,
        title: step.title,
        subtitle: step.subtitle,
        status: 'done' as const,
        content,
        visibleContent: content
      }]
    })
}

// 构建已完成的响应流
export const buildCompletedResponseFlow = (message: ChatMessage): AssistantResponseFlow => ({
  thinking: [
    ...buildKnowledgeRecallStage(message.id, message.citations ?? []),
    ...buildThinkingStages(message)
  ],
  answer: {
    kind: 'answer',
    title: FINAL_ANSWER_TITLE,
    status: 'done',
    content: message.content,
    visibleContent: message.content
  },
  sources: message.citations ?? [],
  sourcesStatus: message.citations?.length ? 'done' : 'pending',
  totalDurationMs: message.latencyMs ?? undefined,
  showActions: true
})

// 创建空的流式占位响应流
export const createThinkingPlaceholderFlow = (): AssistantResponseFlow => ({
  thinking: [],
  answer: {
    kind: 'answer',
    title: FINAL_ANSWER_TITLE,
    status: 'pending',
    content: '',
    visibleContent: ''
  },
  sources: [],
  sourcesStatus: 'pending',
  showActions: false
})

export const startStreamingProcessStage = (
  flow: AssistantResponseFlow,
  stage: WorkspaceRunStage
): AssistantResponseFlow => {
  const existing = flow.thinking.find((item) => item.id === stage.id)
  if (existing) {
    return {
      ...flow,
      thinking: flow.thinking.map((item) =>
        item.id === stage.id
          ? {
              ...item,
              stageKey: stage.stageKey,
              title: stage.title,
              subtitle: stage.subtitle,
              status: stage.status
            }
          : item
      )
    }
  }

  return {
    ...flow,
    thinking: [
      ...flow.thinking,
      {
        kind: 'process',
        id: stage.id,
        stageKey: stage.stageKey,
        title: stage.title,
        subtitle: stage.subtitle,
        status: stage.status,
        content: '',
        visibleContent: ''
      }
    ]
  }
}

export const completeStreamingProcessStage = (
  flow: AssistantResponseFlow,
  stageId: string,
  subtitle?: string
): AssistantResponseFlow => ({
  ...flow,
  thinking: flow.thinking.map((stage) =>
    stage.id === stageId
      ? {
          ...stage,
          subtitle: subtitle ?? stage.subtitle,
          status: 'done',
          visibleContent: stage.content
        }
      : stage
  )
})

// 追加流式思考内容
export const appendStreamingThinkingStageDelta = (
  flow: AssistantResponseFlow,
  delta: string
): AssistantResponseFlow => {
  const stage =
    [...flow.thinking].reverse().find((item) => item.stageKey === 'llm_reasoning') ??
    flow.thinking.find((item) => item.id === VISIBLE_REASONING_STAGE_ID)

  if (!delta) {
    return flow
  }

  if (!stage) {
    return appendStreamingThinkingStageDelta(
      startStreamingProcessStage(flow, {
        id: VISIBLE_REASONING_STAGE_ID,
        stageKey: 'llm_reasoning',
        title: '分析问题与证据',
        subtitle: '正在形成可展示推理摘要',
        status: 'running'
      }),
      delta
    )
  }

  return {
    ...flow,
    thinking: flow.thinking.map((item) =>
      item.id === stage.id
        ? {
            ...item,
            status: 'running',
            content: item.content + delta,
            visibleContent: item.visibleContent + delta
          }
        : item
    )
  }
}

export const attachStreamingSources = (
  flow: AssistantResponseFlow,
  sources: KnowledgeSearchHit[]
): AssistantResponseFlow => {
  const ensuredFlow = flow.thinking.some((stage) => stage.id === KNOWLEDGE_RECALL_STAGE_ID)
    ? flow
    : startStreamingProcessStage(flow, {
        id: KNOWLEDGE_RECALL_STAGE_ID,
        stageKey: 'knowledge_recall',
        title: '检索知识库',
        subtitle: '正在匹配相关 chunk',
        status: 'running'
      })

  const nextFlow = {
    ...ensuredFlow,
    sources,
    sourcesStatus: 'done' as const
  }

  return completeStreamingProcessStage(
    nextFlow,
    KNOWLEDGE_RECALL_STAGE_ID,
    sources.length ? `已命中 ${sources.length} 个 chunk` : '没有命中可引用的知识库片段'
  )
}

// 追加流式回答内容
export const appendStreamingAnswerDelta = (
  flow: AssistantResponseFlow,
  delta: string
): AssistantResponseFlow => {
  const withAnswerStage = flow.thinking.some((stage) => stage.id === ANSWER_SYNTHESIS_STAGE_ID)
    ? flow
    : startStreamingProcessStage(flow, {
        id: ANSWER_SYNTHESIS_STAGE_ID,
        stageKey: 'answer_synthesis',
        title: '组织最终回答',
        subtitle: '正在输出面向用户的完整回复',
        status: 'running'
      })

  return {
    ...withAnswerStage,
    //声明答案开始输出后立即结束其他过程阶段流式状态
    thinking: withAnswerStage.thinking.map((stage) => ({
      ...stage,
      status: stage.id === ANSWER_SYNTHESIS_STAGE_ID ? 'running' : 'done'
    })),
    answer: {
      ...withAnswerStage.answer,
      status: 'running',
      content: withAnswerStage.answer.content + delta,
      visibleContent: withAnswerStage.answer.visibleContent + delta
    }
  }
}

// 完成整个流式响应
export const finalizeStreamingResponseFlow = (
  flow: AssistantResponseFlow,
  latencyMs?: number | null
): AssistantResponseFlow => ({
  thinking: flow.thinking.map((stage) => ({
    ...stage,
    status: 'done',
    visibleContent: stage.content
  })),
  answer: {
    ...flow.answer,
    status: 'done',
    visibleContent: flow.answer.content
  },
  sources: flow.sources,
  sourcesStatus: flow.sourcesStatus,
  totalDurationMs: latencyMs ?? undefined,
  showActions: true
})
