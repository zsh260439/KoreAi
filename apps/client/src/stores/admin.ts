import { ref } from 'vue'
import { defineStore } from 'pinia'

import {
  createKnowledgeBaseEntry,
  createPipeline,
  deleteKnowledgeBaseAPI,
  deleteKnowledgeDocumentAPI,
  deletePipeline,
  fetchDashboardData,
  fetchDocumentChunkLogs,
  fetchDocumentChunks,
  fetchDocumentDetail,
  fetchKnowledgeBases,
  fetchKnowledgeDocuments,
  fetchPipelineTasks,
  fetchPipelines,
  fetchSearchSuggestions,
  fetchSystemSettings,
  fetchTraceDetail,
  fetchTraces,
  renameKnowledgeBaseEntry,
  startDocumentChunk,
  updateKnowledgeDocumentAPI,
  updatePipeline,
  uploadDocument
} from '@/servers'
import type {
  AdminKnowledgeDocument,
  DashboardData,
  KnowledgeBaseCreatePayload,
  KnowledgeBaseView,
  KnowledgeChunk,
  KnowledgeDocumentChunkLog,
  KnowledgeDocumentUpdatePayload,
  KnowledgeDocumentUploadPayload,
  PipelineDefinition,
  PipelineDefinitionPayload,
  PipelineTask,
  SearchSuggestionGroup,
  SystemSettings,
  TraceDetail,
  TraceSummary
} from '@/types'
import type {
  KnowledgeBase as SharedKnowledgeBase,
  KnowledgeDocument as SharedKnowledgeDocument
} from 'share-type'

function mapKnowledgeBaseToView(
  item: SharedKnowledgeBase
): KnowledgeBaseView {
  return {
    ...item,
    collectionName: item.name.trim().toLowerCase().replace(/\s+/g, '_'),
    createdBy: ''
  }
}

function mapSharedDocumentToView(
  document: SharedKnowledgeDocument
): AdminKnowledgeDocument {
  return {
    ...document,
    type: document.fileType?.toUpperCase() ?? (document.sourceType === 'url' ? 'URL' : 'FILE'),
    source: document.sourceLocation || document.storagePath || '',
    fileSize: document.fileSizeBytes,
    chunkConfigText: document.chunkConfig ? JSON.stringify(document.chunkConfig, null, 2) : ''
  }
}

export const useAdminStore = defineStore('admin', () => {
  const dashboard = ref<DashboardData | null>(null)
  const knowledgeBases = ref<KnowledgeBaseView[]>([])
  const documentsByKb = ref<Record<string, AdminKnowledgeDocument[]>>({})
  const chunksByDocument = ref<Record<string, KnowledgeChunk[]>>({})
  const selectedDocument = ref<AdminKnowledgeDocument | null>(null)
  const pipelines = ref<PipelineDefinition[]>([])
  const tasks = ref<PipelineTask[]>([])
  const traces = ref<TraceSummary[]>([])
  const traceDetail = ref<TraceDetail | null>(null)
  const settings = ref<SystemSettings | null>(null)
  const searchSuggestions = ref<SearchSuggestionGroup[]>([])
  const chunkLogs = ref<Record<string, KnowledgeDocumentChunkLog[]>>({})
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
      const items = await fetchKnowledgeBases()
      knowledgeBases.value = (items as SharedKnowledgeBase[]).map(mapKnowledgeBaseToView)
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
      const items = await fetchKnowledgeDocuments(kbId)
      documentsByKb.value = {
        ...documentsByKb.value,
        [kbId]: (items as SharedKnowledgeDocument[]).map(mapSharedDocumentToView)
      }
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载文档失败'
    } finally {
      loading.value = false
    }
  }

  const createKnowledgeBase = async (payload: KnowledgeBaseCreatePayload) => {
    const created = (await createKnowledgeBaseEntry(payload)) as SharedKnowledgeBase
    const mappedCreated = mapKnowledgeBaseToView(created)
    knowledgeBases.value = [mappedCreated, ...knowledgeBases.value]
    documentsByKb.value = {
      ...documentsByKb.value,
      [created.id]: []
    }
    return mappedCreated
  }

  const renameKnowledgeBase = async (kbId: string, name: string) => {
    const updated = (await renameKnowledgeBaseEntry(kbId, name)) as SharedKnowledgeBase | null
    if (!updated) return null

    const mappedUpdated = mapKnowledgeBaseToView(updated)
    knowledgeBases.value = knowledgeBases.value.map((item) =>
      item.id === kbId ? mappedUpdated : item
    )
    return mappedUpdated
  }

  const removeKnowledgeBase = async (kbId: string) => {
    const response = await deleteKnowledgeBaseAPI(kbId)
    if (!response.data) {
      return false
    }

    knowledgeBases.value = knowledgeBases.value.filter((item) => item.id !== kbId)

    const nextDocuments = { ...documentsByKb.value }
    const removedDocuments = nextDocuments[kbId] ?? []
    delete nextDocuments[kbId]
    documentsByKb.value = nextDocuments

    const nextChunks = { ...chunksByDocument.value }
    for (const document of removedDocuments) {
      delete nextChunks[document.id]
    }
    chunksByDocument.value = nextChunks
    return true
  }

  const loadDocumentDetail = async (kbId: string, docId: string) => {
    const item = (await fetchDocumentDetail(kbId, docId)) as SharedKnowledgeDocument | null
    selectedDocument.value = item ? mapSharedDocumentToView(item) : null
  }

  const loadDocumentChunks = async (docId: string) => {
    const chunks = await fetchDocumentChunks(docId)
    chunksByDocument.value = {
      ...chunksByDocument.value,
      [docId]: chunks
    }
    return chunks
  }

  const updateDocument = async (
    kbId: string,
    docId: string,
    payload: KnowledgeDocumentUpdatePayload
  ) => {
    const parsedChunkConfig = payload.chunkConfig ? JSON.parse(payload.chunkConfig) : undefined

    const response = await updateKnowledgeDocumentAPI(docId, {
      name: payload.name.trim(),
      chunkStrategy: payload.chunkStrategy?.trim(),
      chunkConfig: parsedChunkConfig
    })
    const updated = response.data as SharedKnowledgeDocument | undefined

    if (!updated) {
      return null
    }

    const mappedUpdated = mapSharedDocumentToView(updated)
    selectedDocument.value = mappedUpdated
    documentsByKb.value = {
      ...documentsByKb.value,
      [kbId]: (documentsByKb.value[kbId] ?? []).map((document) =>
        document.id === docId ? mappedUpdated : document
      )
    }
    return mappedUpdated
  }

  const removeDocument = async (kbId: string, docId: string) => {
    const response = await deleteKnowledgeDocumentAPI(docId)
    if (!response.data) {
      return false
    }

    documentsByKb.value = {
      ...documentsByKb.value,
      [kbId]: (documentsByKb.value[kbId] ?? []).filter((document) => document.id !== docId)
    }

    if (selectedDocument.value?.id === docId) {
      selectedDocument.value = null
    }

    await loadKnowledgeBases()
    return true
  }

  const runDocumentChunk = async (kbId: string, docId: string) => {
    const updated = (await startDocumentChunk(kbId, docId)) as SharedKnowledgeDocument | null
    if (!updated) {
      return null
    }

    const mappedUpdated = mapSharedDocumentToView(updated)
    documentsByKb.value = {
      ...documentsByKb.value,
      [kbId]: (documentsByKb.value[kbId] ?? []).map((document) =>
        document.id === docId ? mappedUpdated : document
      )
    }

    if (selectedDocument.value?.id === docId) {
      selectedDocument.value = mappedUpdated
    }

    await loadDocumentChunks(docId)
    return mappedUpdated
  }

  const uploadKnowledgeDocument = async (
    kbId: string,
    payload: KnowledgeDocumentUploadPayload
  ) => {
    const created = (await uploadDocument(kbId, payload)) as SharedKnowledgeDocument
    const mappedCreated = mapSharedDocumentToView(created)
    documentsByKb.value = {
      ...documentsByKb.value,
      [kbId]: [mappedCreated, ...(documentsByKb.value[kbId] ?? [])]
    }
    await loadKnowledgeBases()
    return mappedCreated
  }

  const loadDocumentChunkLogs = async (docId: string) => {
    const logs = await fetchDocumentChunkLogs(docId)
    chunkLogs.value = {
      ...chunkLogs.value,
      [docId]: logs
    }
    return logs
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

  const createPipelineDefinitionEntry = async (payload: PipelineDefinitionPayload) => {
    const created = await createPipeline(payload)
    pipelines.value = [created, ...pipelines.value]
    return created
  }

  const updatePipelineDefinitionEntry = async (
    pipelineId: string,
    payload: PipelineDefinitionPayload
  ) => {
    const updated = await updatePipeline(pipelineId, payload)
    if (!updated) return null
    pipelines.value = pipelines.value.map((item) => (item.id === pipelineId ? updated : item))
    return updated
  }

  const removePipelineDefinitionEntry = async (pipelineId: string) => {
    const deleted = await deletePipeline(pipelineId)
    if (!deleted) return false
    pipelines.value = pipelines.value.filter((item) => item.id !== pipelineId)
    return true
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
    chunksByDocument,
    selectedDocument,
    pipelines,
    tasks,
    traces,
    traceDetail,
    settings,
    searchSuggestions,
    chunkLogs,
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
    createKnowledgeBase,
    renameKnowledgeBase,
    removeKnowledgeBase,
    loadDocuments,
    loadDocumentDetail,
    loadDocumentChunks,
    updateDocument,
    removeDocument,
    runDocumentChunk,
    uploadKnowledgeDocument,
    loadDocumentChunkLogs,
    loadPipelines,
    createPipelineDefinitionEntry,
    updatePipelineDefinitionEntry,
    removePipelineDefinitionEntry,
    loadTraces,
    loadTraceDetail,
    loadSettings,
    updateSearch
  }
})
