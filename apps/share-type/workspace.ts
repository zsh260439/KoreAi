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

// 声明工作台消息结构，召回命中与召回调试信息分开保存，避免把同一份 debug 重复塞进每条 hit。
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

// 声明工作台问答结果结构，前端完成态和历史回放都复用这一份返回体。
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

// 声明工作台流式事件结构，sources 事件同时携带命中结果与本次检索 debug，便于聊天页做可解释展示。
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
