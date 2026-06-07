export type AssistantRenderStatus = 'pending' | 'running' | 'done' | 'error'

export type AssistantThinkingStageKey = 'llm_reasoning' | 'deepsearch' | 'web_search'

export interface AssistantThinkingStage {
  kind: 'thinking'
  id: string
  stageKey: AssistantThinkingStageKey
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
