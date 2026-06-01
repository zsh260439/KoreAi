import type { ExecutionStatus, RetrievalCitation, ToolCall } from '../chat'

export interface TraceSummary {
  id: string
  traceId?: string
  traceName: string
  question?: string
  route?: string
  conversationId?: string
  taskId?: string
  userId?: string
  userName?: string
  username?: string
  toolCount?: number
  model?: string
  inputTokens?: number
  outputTokens?: number
  latencyMs?: number
  durationMs: number
  status: ExecutionStatus
  errorMessage?: string
  createdAt?: string
  startTime: string
}

export interface TraceStep {
  id: string
  title: string
  kind: 'router' | 'retrieval' | 'tool' | 'response'
  status: ExecutionStatus
  startAt: string
  endAt: string
  durationMs: number
  detail: string
}

export interface ToolExecution extends ToolCall {
  startedAt: string
  endedAt: string
}

export interface TraceNode {
  nodeId: string
  nodeName?: string
  methodName?: string
  nodeType?: string
  status: ExecutionStatus | 'failed' | 'timeout'
  depth?: number
  startTime?: string
  endTime?: string
  durationMs?: number
}

export interface TraceDetail {
  summary: TraceSummary
  steps: TraceStep[]
  nodes: TraceNode[]
  citations: RetrievalCitation[]
  toolExecutions: ToolExecution[]
  finalAnswer: string
  rawMeta: Record<string, unknown>
  routeReason: string
  retrievalQuery: string
  hitChunks: number
}
