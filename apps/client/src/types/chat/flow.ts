import type { KnowledgeReasoningStepKey, KnowledgeSearchDebugInfo, KnowledgeSearchHit } from 'share-type'

export type AssistantRenderStatus = 'pending' | 'running' | 'done' | 'error'

// 复用共享推理阶段类型，避免前后端各自维护一套 stageKey 常量。
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

// 把召回调试信息挂在 responseFlow 上，保证流式过程和完成态都能使用同一份 UI 数据源。
export interface AssistantResponseFlow {
  thinking: AssistantThinkingStage[]
  answer: AssistantAnswerStage
  sources: KnowledgeSearchHit[]
  retrievalDebug: KnowledgeSearchDebugInfo | null
  sourcesStatus: AssistantRenderStatus
  totalDurationMs?: number
  showActions: boolean
}
