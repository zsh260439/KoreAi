import type { AssistantResponseFlow, AssistantThinkingStage } from '@/types/chat/flow'
import type { ChatMessage, ChatMessageStatus, ChatRole } from '@/types/chat/models'
import type {
  KnowledgeReasoningStep,
  KnowledgeSearchHit,
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

//声明单块思考消息固定下标
const SINGLE_THINKING_STAGE_INDEX = 0

// 判断是否需要渲染思考过程
const shouldRenderThinking = (message: ChatMessage): message is ChatMessageWithThinking =>
  Boolean(message.promptCapabilities?.think) && Array.isArray(message.reasoningSteps)

//声明历史推理步骤合并为单块思考文本
const buildThinkingContent = (message: ChatMessage): string => {
  if (!shouldRenderThinking(message)) {
    return ''
  }

  return message.reasoningSteps
    .map((step) => step.content.trim())
    .filter(Boolean)
    .join('\n\n')
}

//声明单块思考消息构造逻辑
const buildThinkingStages = (message: ChatMessage): AssistantThinkingStage[] => {
  const thinkingContent = buildThinkingContent(message)
  if (!thinkingContent) {
    return []
  }

  const firstStep = message.reasoningSteps?.[0]

  return [{
    kind: 'thinking',
    id: `${message.id}-thinking`,
    stageKey: firstStep?.stageKey ?? 'llm_reasoning',
    title: firstStep?.title ?? '思考过程',
    subtitle: undefined,
    status: 'done',
    content: thinkingContent,
    visibleContent: thinkingContent
  }]
}

// 构建已完成的响应流
export const buildCompletedResponseFlow = (message: ChatMessage): AssistantResponseFlow => ({
  thinking: buildThinkingStages(message),
  answer: {
    kind: 'answer',
    title: FINAL_ANSWER_TITLE,
    status: 'done',
    content: message.content,
    visibleContent: message.content
  },
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
  showActions: false
})

// 追加流式思考内容
export const appendStreamingThinkingStageDelta = (
  flow: AssistantResponseFlow,
  delta: string
): AssistantResponseFlow => {
  const stage = flow.thinking[SINGLE_THINKING_STAGE_INDEX]
  if (!delta) {
    return flow
  }

  if (!stage) {
    return {
      ...flow,
      thinking: [{
        kind: 'thinking',
        id: 'streaming-thinking',
        stageKey: 'llm_reasoning',
        title: '思考过程',
        status: 'running',
        content: delta,
        visibleContent: delta
      }]
    }
  }

  return {
    ...flow,
    thinking: [{
      ...stage,
      status: 'running',
      content: stage.content + delta,
      visibleContent: stage.visibleContent + delta
    }]
  }
}

// 追加流式回答内容
export const appendStreamingAnswerDelta = (
  flow: AssistantResponseFlow,
  delta: string
): AssistantResponseFlow => ({
  ...flow,
  //声明答案开始输出后立即结束思考区流式状态
  thinking: flow.thinking.map((stage) => ({
    ...stage,
    status: 'done'
  })),
  answer: {
    ...flow.answer,
    status: 'running',
    content: flow.answer.content + delta,
    visibleContent: flow.answer.visibleContent + delta
  }
})

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
  totalDurationMs: latencyMs ?? undefined,
  showActions: true
})
