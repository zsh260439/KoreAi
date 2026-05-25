import { ref } from 'vue'
import { defineStore } from 'pinia'

import {
  fetchDashboardData,
  fetchDocumentDetail,
  fetchKnowledgeBases,
  fetchKnowledgeDocuments,
  fetchPipelines,
  fetchPipelineTasks,
  fetchSearchSuggestions,
  fetchSystemSettings,
  fetchTraceDetail,
  fetchTraces
} from '@/servers/admin'
import type {
  DashboardData,
  KnowledgeBase,
  KnowledgeDocument,
  PipelineTask,
  SearchSuggestionGroup,
  SystemSettings,
  TraceDetail,
  TraceSummary
} from '@/types/models'

export const useAdminStore = defineStore('admin', () => {
  const dashboard = ref<DashboardData | null>(null)
  const knowledgeBases = ref<KnowledgeBase[]>([])
  const documentsByKb = ref<Record<string, KnowledgeDocument[]>>({})
  const selectedDocument = ref<KnowledgeDocument | null>(null)
  const pipelines = ref<PipelineTask[]>([])
  const tasks = ref<PipelineTask[]>([])
  const traces = ref<TraceSummary[]>([])
  const traceDetail = ref<TraceDetail | null>(null)
  const settings = ref<SystemSettings | null>(null)
  const searchSuggestions = ref<SearchSuggestionGroup[]>([])
  const searchValue = ref('')
  const searchLoading = ref(false)
  const collapsed = ref(false)
  const mobileSidebarOpen = ref(false)
  const loading = ref(false)
  const error = ref('')

  const toggleCollapse = () => {
    collapsed.value = !collapsed.value
  }

  const toggleMobileSidebar = (open?: boolean) => {
    mobileSidebarOpen.value = typeof open === 'boolean' ? open : !mobileSidebarOpen.value
  }

  const loadDashboard = async () => {
    loading.value = true
    error.value = ''
    try {
      dashboard.value = await fetchDashboardData()
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载 Dashboard 失败'
    } finally {
      loading.value = false
    }
  }

  const loadKnowledgeBases = async () => {
    loading.value = true
    error.value = ''
    try {
      knowledgeBases.value = await fetchKnowledgeBases()
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载知识库失败'
    } finally {
      loading.value = false
    }
  }

  const loadDocuments = async (kbId: string) => {
    loading.value = true
    error.value = ''
    try {
      documentsByKb.value = {
        ...documentsByKb.value,
        [kbId]: await fetchKnowledgeDocuments(kbId)
      }
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载文档失败'
    } finally {
      loading.value = false
    }
  }

  const loadDocumentDetail = async (kbId: string, docId: string) => {
    selectedDocument.value = await fetchDocumentDetail(kbId, docId)
  }

  const loadPipelines = async () => {
    loading.value = true
    error.value = ''
    try {
      const [nextPipelines, nextTasks] = await Promise.all([fetchPipelines(), fetchPipelineTasks()])
      pipelines.value = nextPipelines
      tasks.value = nextTasks
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载流水线任务失败'
    } finally {
      loading.value = false
    }
  }

  const loadTraces = async () => {
    loading.value = true
    error.value = ''
    try {
      traces.value = await fetchTraces()
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载链路失败'
    } finally {
      loading.value = false
    }
  }

  const loadTraceDetail = async (traceId: string) => {
    loading.value = true
    error.value = ''
    try {
      traceDetail.value = await fetchTraceDetail(traceId)
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载链路详情失败'
    } finally {
      loading.value = false
    }
  }

  const loadSettings = async () => {
    loading.value = true
    error.value = ''
    try {
      settings.value = await fetchSystemSettings()
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载系统设置失败'
    } finally {
      loading.value = false
    }
  }

  const updateSearch = async (query: string) => {
    searchValue.value = query
    searchLoading.value = true
    searchSuggestions.value = await fetchSearchSuggestions(query)
    searchLoading.value = false
  }

  return {
    dashboard,
    knowledgeBases,
    documentsByKb,
    selectedDocument,
    pipelines,
    tasks,
    traces,
    traceDetail,
    settings,
    searchSuggestions,
    searchValue,
    searchLoading,
    collapsed,
    mobileSidebarOpen,
    loading,
    error,
    toggleCollapse,
    toggleMobileSidebar,
    loadDashboard,
    loadKnowledgeBases,
    loadDocuments,
    loadDocumentDetail,
    loadPipelines,
    loadTraces,
    loadTraceDetail,
    loadSettings,
    updateSearch
  }
})
