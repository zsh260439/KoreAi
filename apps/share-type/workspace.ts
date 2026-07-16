import type {
  KnowledgeQaDeltaEvent,
  KnowledgeReasoningStep,
  KnowledgeReasoningStepKey,
  KnowledgeSearchDebugInfo,
  KnowledgeSearchHit
} from './knowledge.js'

export interface WorkspacePromptCapabilities {
  think: boolean
  rewrite?: boolean
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
  retrievalDebug: KnowledgeSearchDebugInfo | null
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
  rewrite?: boolean
  regenerate?: boolean
}

export interface WorkspaceChatResult {
  answer: string
  sources: KnowledgeSearchHit[]
  retrievalDebug: KnowledgeSearchDebugInfo | null
  model: string | null
  reasoningSteps: KnowledgeReasoningStep[] | null
  totalTokens: number | null
  conversationId: string
  conversation: WorkspaceConversationSummary
  latencyMs: number
}

export interface WorkspaceRunStage {
  id: string
  stageKey: KnowledgeReasoningStepKey
  title: string
  subtitle?: string
  status: 'running' | 'done'
}

export type WorkspaceChatStreamEvent =
  | {
      type: 'stage_started'
      data: WorkspaceRunStage
    }
  | {
      type: 'stage_completed'
      data: {
        stageId: string
        subtitle?: string
      }
    }
  | {
      type: 'thinking_delta'
      delta: string
    }
  | {
      type: 'sources'
      data: {
        sources: KnowledgeSearchHit[]
        retrievalDebug: KnowledgeSearchDebugInfo | null
      }
    }
  | KnowledgeQaDeltaEvent
  | {
      type: 'completed'
      data: WorkspaceChatResult
    }
  | {
      type: 'error'
      message: string
    }
