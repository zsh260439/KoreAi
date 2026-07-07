import type { AssistantResponseFlow } from './flow'
import type { WorkspaceMessage } from 'share-type'

export type ChatMessageStatus = 'done' | 'streaming' | 'error'

export interface ChatMessage extends WorkspaceMessage {
  status: ChatMessageStatus
  responseFlow?: AssistantResponseFlow
}
