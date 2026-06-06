import type { AssistantResponseFlow, AssistantSearchResultItem } from './flow'
import type { KnowledgeSearchHit } from 'share-type'

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
  phase?: 'deepsearch' | 'mcp_web_search' | 'knowledge' | 'tool'
  presentation?: 'default' | 'compact-search'
  resultCount?: number
  searchQuery?: string
  searchResults?: AssistantSearchResultItem[]
}
// 定义提示能力 默认不开启思考和搜索
export interface PromptCapabilities {
  think: boolean
  search: boolean
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  status: ChatMessageStatus
  responseFlow?: AssistantResponseFlow
  toolCalls?: ToolCall[]
  citations?: KnowledgeSearchHit[]
  traceId?: string
  model?: string
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  promptCapabilities?: PromptCapabilities
}
