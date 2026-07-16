import type { AssistantResponseFlow } from './flow'
import type { WorkspaceMessage, WorkspacePromptCapabilities } from 'share-type'

export type ChatMessageStatus = 'done' | 'streaming' | 'error'

export interface ChatMessage extends WorkspaceMessage {
  status: ChatMessageStatus
  // responseFlow 只服务于前端渲染，不回写数据库。
  responseFlow?: AssistantResponseFlow
}

export type EditableUserMessage = {
  message: ChatMessage
  promptCapabilities: WorkspacePromptCapabilities
}
