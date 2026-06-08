import type {
  KnowledgeAskResult,
  KnowledgeReasoningStep,
  KnowledgeSearchHit
} from './knowledge.js'

export type WorkspaceMessageRole = 'user' | 'assistant'

export interface WorkspacePromptCapabilities {
  think: boolean
  search: boolean
}

export interface WorkspaceConversationSummary {
  id: string
  title: string
  updatedAt: string
  messageCount: number
  model: string | null
}

export interface WorkspaceMessage {
  id: string
  conversationId: string
  role: WorkspaceMessageRole
  content: string
  createdAt: string
  citations: KnowledgeSearchHit[] | null
  model: string | null
  latencyMs: number | null
  totalTokens: number | null
  reasoningSteps: KnowledgeReasoningStep[] | null
  promptCapabilities: WorkspacePromptCapabilities | null
}

export interface CreateWorkspaceConversationInput {
  title?: string
}

export interface WorkspaceChatInput {
  conversationId?: string
  query: string
  knowledgeBaseId?: string
  think?: boolean
  regenerate?: boolean
}

export interface WorkspaceChatResult extends KnowledgeAskResult {
  conversationId: string
  conversation: WorkspaceConversationSummary
  latencyMs: number
}

export type WorkspaceChatStreamEvent =
  | {
      type: 'reasoning_step_started'
      index: number
      step: Omit<KnowledgeReasoningStep, 'content'>
    }
  | {
      type: 'reasoning_step_delta'
      index: number
      delta: string
    }
  | {
      type: 'reasoning_step_completed'
      index: number
      content: string
    }
  | {
      type: 'answer_delta'
      delta: string
    }
  | {
      type: 'completed'
      data: WorkspaceChatResult
    }
  | {
      type: 'error'
      message: string
    }
