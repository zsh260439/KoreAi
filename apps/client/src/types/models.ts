import type { AssistantResponseFlow } from '@/types/chat-flow'

export type ChatRole = 'user' | 'assistant' | 'system-summary'
export type ChatMessageStatus = 'done' | 'streaming' | 'error'
export type ExecutionStatus = 'success' | 'running' | 'error' | 'paused'

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
  messageCount: number
  model: string
  description?: string
}

export interface ToolCall {
  id: string
  name: string
  status: ExecutionStatus
  durationMs: number
  inputPreview: string
  outputPreview: string
  summary?: string
  steps?: string[]
  model?: string
  tokens?: number
}

export interface RetrievalCitation {
  id: string
  title: string
  documentName: string
  chunkIndex: number
  content: string
  score: number
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  status: ChatMessageStatus
  responseFlow?: AssistantResponseFlow
  toolCalls?: ToolCall[]
  citations?: RetrievalCitation[]
  traceId?: string
  model?: string
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
}

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

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  documentCount: number
  updatedAt: string
  status: 'active' | 'draft' | 'syncing'
  owner: string
  tags: string[]
  embeddingModel?: string
  collectionName?: string
  createdBy?: string
  createTime?: string
  updateTime?: string
}

export interface KnowledgeDocument {
  id: string
  name: string
  docName?: string
  type: string
  status: 'indexed' | 'processing' | 'failed' | 'success' | 'running' | 'pending'
  updatedAt: string
  size: string
  chunks: number
  source: string
  summary: string
  sourceType?: 'file' | 'url'
  processMode?: 'chunk' | 'pipeline' | string
  enabled?: boolean
  chunkStrategy?: string
  chunkConfig?: string
  pipelineId?: string
  pipelineName?: string
  sourceLocation?: string
  scheduleEnabled?: boolean
  scheduleCron?: string
  updateTime?: string
  fileType?: string
  fileSize?: number
  chunkCount?: number
  contentPreview?: string
}

export interface KnowledgeDocumentUpdatePayload {
  docName: string
  sourceLocation?: string
  scheduleEnabled?: boolean
  scheduleCron?: string
  processMode: 'chunk' | 'pipeline'
  chunkStrategy?: string
  chunkConfig?: string
  pipelineId?: string
}

export interface KnowledgeDocumentUploadPayload extends KnowledgeDocumentUpdatePayload {
  sourceType: 'file' | 'url'
  file?: File | null
}

export interface KnowledgeDocumentChunkLog {
  id: string
  documentId: string
  status: KnowledgeDocument['status']
  sourceType?: KnowledgeDocument['sourceType']
  processMode?: KnowledgeDocument['processMode']
  chunkStrategy?: string
  pipelineId?: string
  pipelineName?: string
  chunkCount?: number
  extractDuration?: number
  chunkDuration?: number
  embedDuration?: number
  persistDuration?: number
  otherDuration?: number
  totalDuration?: number
  updateTime?: string
  updatedAt?: string
}

export interface PipelineTask {
  id: string
  name: string
  type: 'pipeline' | 'task'
  status: ExecutionStatus
  progress: number
  updatedAt: string
  owner: string
  detail: string
}

export interface IntentNode {
  id: string
  name: string
  description: string
  sampleCount: number
  children?: IntentNode[]
}

export interface QueryMapping {
  id: string
  keyword: string
  intent: string
  target: string
  updatedAt: string
  status: 'active' | 'draft'
}

export interface SampleQuestion {
  id: string
  question: string
  category: string
  updatedAt: string
}

export interface User {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'invited'
  lastActive: string
}

export interface ProviderConfig {
  id: string
  name: string
  endpoint: string
  model: string
  enabled: boolean
}

export interface PromptStrategy {
  id: string
  name: string
  description: string
  temperature: number
  maxTokens: number
  isDefault: boolean
}

export interface McpServer {
  id: string
  name: string
  url: string
  status: 'online' | 'offline' | 'checking'
  toolCount: number
  lastCheckedAt: string
  tools: string[]
}

export interface SystemSettings {
  providers: ProviderConfig[]
  promptStrategies: PromptStrategy[]
  mcpServers: McpServer[]
}

export interface SearchSuggestion {
  id: string
  title: string
  description: string
  href: string
}

export interface SearchSuggestionGroup {
  label: string
  items: SearchSuggestion[]
}

export interface DashboardMetric {
  label: string
  value: string
  delta: string
  trend: 'up' | 'down' | 'flat'
}

export interface DashboardTrendPoint {
  label: string
  value: number
}

export interface DashboardData {
  metrics: DashboardMetric[]
  trend: DashboardTrendPoint[]
  recentTasks: PipelineTask[]
  recentTraces: TraceSummary[]
}
