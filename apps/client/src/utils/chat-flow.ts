import type { AssistantResponseFlow, AssistantThinkingStage } from '@/types/chat/flow'
import type { ChatMessage } from '@/types/chat/models'

type ThinkingStageDraft = Pick<AssistantThinkingStage, 'stageKey' | 'title' | 'subtitle'>
type ChatMessageWithThinking = ChatMessage & {
  reasoningSteps: NonNullable<ChatMessage['reasoningSteps']>
}

const FINAL_ANSWER_TITLE = '\u6700\u7ec8\u56de\u7b54'

const shouldRenderThinking = (message: ChatMessage): message is ChatMessageWithThinking =>
  Boolean(message.promptCapabilities?.think) && Array.isArray(message.reasoningSteps)

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
