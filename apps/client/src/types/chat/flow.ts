export type AssistantRenderStatus = 'pending' | 'running' | 'done' | 'error'

export type AssistantToolStepStatus = 'pending' | 'running' | 'success' | 'error'

export type AssistantToolIconKey = 'knowledge' | 'time' | 'weather' | 'search' | 'thinking' | 'generic'

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

export interface AssistantToolStep {
  id: string
  label: string
  status: AssistantToolStepStatus
  children?: AssistantToolStep[]
}

export interface AssistantToolStage {
  kind: 'tool'
  id: string
  toolName: string
  title: string
  subtitle: string
  iconKey: AssistantToolIconKey
  status: AssistantRenderStatus
  inputLabel: string
  input: string
  visibleInput: string
  outputLabel: string
  output: string
  visibleOutput: string
  durationMs: number
  steps: AssistantToolStep[]
  showInput: boolean
  showSteps: boolean
  showOutput: boolean
  startedAt?: string
  endedAt?: string
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
  tools: AssistantToolStage[]
  answer: AssistantAnswerStage
  totalDurationMs?: number
  showActions: boolean
}
