import type {
  KnowledgeReasoningStep,
  KnowledgeSearchHit,
  ReasoningStepMeta
} from './knowledge.js'

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
  role: 'user' | 'assistant'
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

//声明工作台问答结果
export interface WorkspaceChatResult {
  answer: string
  sources: KnowledgeSearchHit[]
  model: string | null
  reasoningSteps: KnowledgeReasoningStep[] | null
  totalTokens: number | null
  conversationId: string
  conversation: WorkspaceConversationSummary
  latencyMs: number
}

//声明工作台流式事件
export type WorkspaceChatStreamEvent =
  | {
      type: 'reasoning_step_started'
      index: number
      step: ReasoningStepMeta
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
