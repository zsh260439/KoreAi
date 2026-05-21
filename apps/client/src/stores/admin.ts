import { defineStore } from 'pinia'

import type {
  DashboardData,
  IntentNode,
  KnowledgeBase,
  KnowledgeDocument,
  PipelineTask,
  QueryMapping,
  SampleQuestion,
  SearchSuggestionGroup,
  SystemSettings,
  TraceDetail,
  TraceSummary,
  User
} from '@/types/models'
import {
  fetchDashboardData,
  fetchDocumentDetail,
  fetchIntentList,
  fetchIntentTree,
  fetchKnowledgeBases,
  fetchKnowledgeDocuments,
  fetchMappings,
  fetchPipelines,
  fetchPipelineTasks,
  fetchSampleQuestions,
  fetchSearchSuggestions,
  fetchSystemSettings,
  fetchTraceDetail,
  fetchTraces,
  fetchUsers
} from '@/servers/admin'

interface AdminState {
  dashboard: DashboardData | null
  knowledgeBases: KnowledgeBase[]
  documentsByKb: Record<string, KnowledgeDocument[]>
  selectedDocument: KnowledgeDocument | null
  pipelines: PipelineTask[]
  tasks: PipelineTask[]
  intentTree: IntentNode[]
  intentList: IntentNode[]
  mappings: QueryMapping[]
  traces: TraceSummary[]
  traceDetail: TraceDetail | null
  sampleQuestions: SampleQuestion[]
  users: User[]
  settings: SystemSettings | null
  searchSuggestions: SearchSuggestionGroup[]
  searchValue: string
  searchLoading: boolean
  collapsed: boolean
  mobileSidebarOpen: boolean
  loading: boolean
  error: string
}

export const useAdminStore = defineStore('admin', {
  state: (): AdminState => ({
    dashboard: null,
    knowledgeBases: [],
    documentsByKb: {},
    selectedDocument: null,
    pipelines: [],
    tasks: [],
    intentTree: [],
    intentList: [],
    mappings: [],
    traces: [],
    traceDetail: null,
    sampleQuestions: [],
    users: [],
    settings: null,
    searchSuggestions: [],
    searchValue: '',
    searchLoading: false,
    collapsed: false,
    mobileSidebarOpen: false,
    loading: false,
    error: ''
  }),
  actions: {
    toggleCollapse() {
      this.collapsed = !this.collapsed
    },
    toggleMobileSidebar(open?: boolean) {
      this.mobileSidebarOpen = typeof open === 'boolean' ? open : !this.mobileSidebarOpen
    },
    async loadDashboard() {
      this.loading = true
      this.error = ''
      try {
        this.dashboard = await fetchDashboardData()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载 Dashboard 失败'
      } finally {
        this.loading = false
      }
    },
    async loadKnowledgeBases() {
      this.loading = true
      this.error = ''
      try {
        this.knowledgeBases = await fetchKnowledgeBases()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载知识库失败'
      } finally {
        this.loading = false
      }
    },
    async loadDocuments(kbId: string) {
      this.loading = true
      this.error = ''
      try {
        this.documentsByKb[kbId] = await fetchKnowledgeDocuments(kbId)
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载文档失败'
      } finally {
        this.loading = false
      }
    },
    async loadDocumentDetail(kbId: string, docId: string) {
      this.selectedDocument = await fetchDocumentDetail(kbId, docId)
    },
    async loadPipelines() {
      this.loading = true
      this.error = ''
      try {
        const [pipelines, tasks] = await Promise.all([fetchPipelines(), fetchPipelineTasks()])
        this.pipelines = pipelines
        this.tasks = tasks
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载数据通道失败'
      } finally {
        this.loading = false
      }
    },
    async loadIntentData() {
      this.loading = true
      this.error = ''
      try {
        const [tree, list] = await Promise.all([fetchIntentTree(), fetchIntentList()])
        this.intentTree = tree
        this.intentList = list
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载意图数据失败'
      } finally {
        this.loading = false
      }
    },
    async loadMappings() {
      this.loading = true
      this.error = ''
      try {
        this.mappings = await fetchMappings()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载映射失败'
      } finally {
        this.loading = false
      }
    },
    async loadTraces() {
      this.loading = true
      this.error = ''
      try {
        this.traces = await fetchTraces()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载链路失败'
      } finally {
        this.loading = false
      }
    },
    async loadTraceDetail(traceId: string) {
      this.loading = true
      this.error = ''
      try {
        this.traceDetail = await fetchTraceDetail(traceId)
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载链路详情失败'
      } finally {
        this.loading = false
      }
    },
    async loadSampleQuestions() {
      this.loading = true
      this.error = ''
      try {
        this.sampleQuestions = await fetchSampleQuestions()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载示例问题失败'
      } finally {
        this.loading = false
      }
    },
    async loadUsers() {
      this.loading = true
      this.error = ''
      try {
        this.users = await fetchUsers()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载用户失败'
      } finally {
        this.loading = false
      }
    },
    async loadSettings() {
      this.loading = true
      this.error = ''
      try {
        this.settings = await fetchSystemSettings()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '加载系统设置失败'
      } finally {
        this.loading = false
      }
    },
    async updateSearch(query: string) {
      this.searchValue = query
      this.searchLoading = true
      this.searchSuggestions = await fetchSearchSuggestions(query)
      this.searchLoading = false
    }
  }
})
