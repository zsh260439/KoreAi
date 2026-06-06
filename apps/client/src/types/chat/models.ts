import type { AssistantResponseFlow } from './flow'
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
  citations?: KnowledgeSearchHit[]
  traceId?: string
  model?: string
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  promptCapabilities?: PromptCapabilities
}
