import type { KnowledgeReasoningStepKey, KnowledgeSearchHit } from 'share-type'

export type AssistantRenderStatus = 'pending' | 'running' | 'done' | 'error'

//复用共享推理阶段类型
export type { KnowledgeReasoningStepKey as AssistantThinkingStageKey } from 'share-type'

export interface AssistantThinkingStage {
  kind: 'process'
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
  sources: KnowledgeSearchHit[]
  sourcesStatus: AssistantRenderStatus
  totalDurationMs?: number
  showActions: boolean
}
