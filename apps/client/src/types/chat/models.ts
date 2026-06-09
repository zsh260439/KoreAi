import type { AssistantResponseFlow } from './flow'
import type {
  KnowledgeReasoningStep,
  KnowledgeSearchHit,
  WorkspacePromptCapabilities
} from 'share-type'

//声明聊天角色类型
export type ChatRole = 'user' | 'assistant' | 'system-summary'

//声明聊天消息状态
export type ChatMessageStatus = 'done' | 'streaming' | 'error'

//声明聊天消息完整结构
export interface ChatMessage {
  id: string
  conversationId: string
  role: ChatRole
  content: string
  createdAt: string
  citations: KnowledgeSearchHit[] | null
  model: string | null
  latencyMs: number | null
  totalTokens: number | null
  reasoningSteps: KnowledgeReasoningStep[] | null
  status: ChatMessageStatus
  responseFlow?: AssistantResponseFlow
  promptCapabilities?: WorkspacePromptCapabilities | null
}
