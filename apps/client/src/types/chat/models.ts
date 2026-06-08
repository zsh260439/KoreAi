import type { AssistantResponseFlow } from './flow'
import type {
  WorkspaceConversationSummary,
  WorkspaceMessage as BaseWorkspaceMessage,
  WorkspacePromptCapabilities
} from 'share-type'

export type ChatRole = BaseWorkspaceMessage['role'] | 'system-summary'
export type ChatMessageStatus = 'done' | 'streaming' | 'error'

export type ConversationSummary = WorkspaceConversationSummary
export type PromptCapabilities = WorkspacePromptCapabilities

export interface ChatMessage extends Omit<BaseWorkspaceMessage, 'promptCapabilities'> {
  status: ChatMessageStatus
  responseFlow?: AssistantResponseFlow
  totalTokens: number | null
  promptCapabilities?: PromptCapabilities | null
}
