import type { KnowledgeReasoningStepKey } from 'share-type'

export type AssistantRenderStatus = 'pending' | 'running' | 'done' | 'error'

//复用共享推理阶段类型
export type { KnowledgeReasoningStepKey as AssistantThinkingStageKey } from 'share-type'

export interface AssistantThinkingStage {
  kind: 'thinking'
  id: string
  stageKey: KnowledgeReasoningStepKey
  title: string
  subtitle?: string
  status: AssistantRenderStatus
  content: string
  visibleContent: string
}

export interface AssistantAnswerStage {
  kind: 'answer'
  title: string
  status: AssistantRenderStatus
  content: string
  visibleContent: string
}

export interface AssistantResponseFlow {
  thinking: AssistantThinkingStage[]
  answer: AssistantAnswerStage
  totalDurationMs?: number
  showActions: boolean
}
