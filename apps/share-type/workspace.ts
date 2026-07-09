import type {
  KnowledgeQaDeltaEvent,
  KnowledgeReasoningStepKey,
  KnowledgeReasoningStep,
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

//声明工作台问答结果结构
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

export interface WorkspaceRunStage {
  id: string
  stageKey: KnowledgeReasoningStepKey
  title: string
  subtitle?: string
  status: 'running' | 'done'
}

//声明工作台流式事件结构
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
