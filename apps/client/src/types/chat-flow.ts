export type AssistantRenderStatus = 'pending' | 'running' | 'done' | 'error'

export type AssistantToolStepStatus = 'pending' | 'running' | 'success' | 'error'

export type AssistantToolIconKey = 'knowledge' | 'time' | 'weather' | 'generic'

export type AssistantThinkingStage = {
  kind: 'thinking'
  title: string
  status: AssistantRenderStatus
  content: string
  visibleContent: string
}

export type AssistantToolStep = {
  id: string
  label: string
  status: AssistantToolStepStatus
  children?: AssistantToolStep[]
}

export type AssistantToolStage = {
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

export type AssistantAnswerStage = {
  kind: 'answer'
  title: string
  status: AssistantRenderStatus
  content: string
  visibleContent: string
}

export type AssistantResponseFlow = {
  thinking: AssistantThinkingStage
  tools: AssistantToolStage[]
  answer: AssistantAnswerStage
  totalDurationMs?: number
  showActions: boolean
}
