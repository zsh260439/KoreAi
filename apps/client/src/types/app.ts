import type { ChatMessage, ConversationSummary, DashboardData, KnowledgeBase, KnowledgeDocument, PipelineTask, SearchSuggestionGroup, SystemSettings, TraceDetail, TraceSummary, User } from '@/types/models'

export type LoginPayload = {
  email: string
  password: string
}

export type AuthState = {
  token: string
  user: User
  loading: boolean
  error: string
}

export type AdminState = {
  dashboard: DashboardData | null
  knowledgeBases: KnowledgeBase[]
  documentsByKb: Record<string, KnowledgeDocument[]>
  selectedDocument: KnowledgeDocument | null
  pipelines: PipelineTask[]
  tasks: PipelineTask[]
  traces: TraceSummary[]
  traceDetail: TraceDetail | null
  settings: SystemSettings | null
  searchSuggestions: SearchSuggestionGroup[]
  searchValue: string
  searchLoading: boolean
  collapsed: boolean
  mobileSidebarOpen: boolean
  loading: boolean
  error: string
}

export type WorkspaceState = {
  sessions: ConversationSummary[]
  messagesBySession: Record<string, ChatMessage[]>
  activeSessionId: string
  selectedTrace: TraceDetail | null
  loading: boolean
  error: string
  detailOpen: boolean
  sidebarOpen: boolean
  collapsed: boolean
  streamingMessageId: string
  streamingRunId: number
}
