import type { PipelineTask } from '../pipeline'
import type { TraceSummary } from '../trace'

export interface User {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'invited'
  lastActive: string
}

export interface ProviderConfig {
  id: string
  name: string
  endpoint: string
  model: string
  enabled: boolean
}

export interface PromptStrategy {
  id: string
  name: string
  description: string
  temperature: number
  maxTokens: number
  isDefault: boolean
}

export interface McpServer {
  id: string
  name: string
  url: string
  status: 'online' | 'offline' | 'checking'
  toolCount: number
  lastCheckedAt: string
  tools: string[]
}

export interface SystemSettings {
  providers: ProviderConfig[]
  promptStrategies: PromptStrategy[]
  mcpServers: McpServer[]
}

export interface SearchSuggestion {
  id: string
  title: string
  description: string
  href: string
}

export interface SearchSuggestionGroup {
  label: string
  items: SearchSuggestion[]
}

export interface DashboardMetric {
  label: string
  value: string
  delta: string
  trend: 'up' | 'down' | 'flat'
}

export interface DashboardTrendPoint {
  label: string
  value: number
}

export interface DashboardData {
  metrics: DashboardMetric[]
  trend: DashboardTrendPoint[]
  recentTasks: PipelineTask[]
  recentTraces: TraceSummary[]
}
