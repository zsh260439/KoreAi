import type { AssistantResponseFlow, AssistantThinkingStage } from '@/types/chat/flow'
import type { ChatMessage, ChatMessageStatus, ChatRole } from '@/types/chat/models'
import type {
  KnowledgeReasoningStep,
  KnowledgeReasoningStepKey,
  KnowledgeSearchHit,
  WorkspacePromptCapabilities
} from 'share-type'

// 流式思考阶段草稿
interface ThinkingStageDraft {
  stageKey: KnowledgeReasoningStepKey
  title: string
  subtitle?: string
}

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

// 判断是否需要渲染思考过程
const shouldRenderThinking = (message: ChatMessage): message is ChatMessageWithThinking =>
  Boolean(message.promptCapabilities?.think) && Array.isArray(message.reasoningSteps)

// 构建思考阶段列表
const buildThinkingStages = (message: ChatMessage): AssistantThinkingStage[] => {
  if (!shouldRenderThinking(message)) {
    return []
  }

  return message.reasoningSteps.map((step, index) => ({
    kind: 'thinking',
    id: `${message.id}-thinking-${index + 1}`,
    stageKey: step.stageKey,
    title: step.title,
    subtitle: step.subtitle,
    status: 'done',
    content: step.content,
    visibleContent: step.content
  }))
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

// 开始流式思考阶段
export const startStreamingThinkingStage = (
  flow: AssistantResponseFlow,
  messageId: string,
  index: number,
  step: ThinkingStageDraft
): AssistantResponseFlow => {
  const thinking = flow.thinking.slice()

  thinking[index] = {
    kind: 'thinking',
    id: `${messageId}-thinking-${index + 1}`,
    stageKey: step.stageKey,
    title: step.title,
    subtitle: step.subtitle,
    status: 'running',
    content: '',
    visibleContent: ''
  }

  return {
    ...flow,
    thinking
  }
}

// 追加流式思考内容
export const appendStreamingThinkingStageDelta = (
  flow: AssistantResponseFlow,
  index: number,
  delta: string
): AssistantResponseFlow => {
  const stage = flow.thinking[index]
  if (!stage || !delta) {
    return flow
  }

  const thinking = flow.thinking.slice()
  thinking[index] = {
    ...stage,
    status: 'running',
    content: stage.content + delta,
    visibleContent: stage.visibleContent + delta
  }

  return {
    ...flow,
    thinking
  }
}

// 完成单个思考阶段
export const completeStreamingThinkingStage = (
  flow: AssistantResponseFlow,
  index: number,
  content: string
): AssistantResponseFlow => {
  const stage = flow.thinking[index]
  if (!stage) {
    return flow
  }

  const thinking = flow.thinking.slice()
  thinking[index] = {
    ...stage,
    status: 'done',
    content,
    visibleContent: content
  }

  return {
    ...flow,
    thinking
  }
}

// 追加流式回答内容
export const appendStreamingAnswerDelta = (
  flow: AssistantResponseFlow,
  delta: string
): AssistantResponseFlow => ({
  ...flow,
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