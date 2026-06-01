import { ref } from 'vue'
import { defineStore } from 'pinia'

import {
  createPipeline,
  createDocumentChunk,
  createKnowledgeBaseEntry,
  deleteKnowledgeBaseAPI,
  deleteKnowledgeChunkAPI,
  deleteKnowledgeDocumentAPI,
  deletePipeline,
  fetchDashboardData,
  fetchDocumentChunks,
  fetchDocumentChunkLogs,
  fetchDocumentDetail,
  fetchKnowledgeBases,
  fetchKnowledgeDocuments,
  fetchPipelines,
  fetchPipelineTasks,
  rebuildDocumentEmbeddings,
  renameKnowledgeBaseEntry,
  fetchSearchSuggestions,
  fetchSystemSettings,
  fetchTraceDetail,
  fetchTraces,
  startDocumentChunk,
  toggleDocumentChunkEnabled,
  toggleDocumentEnabled,
  updateKnowledgeDocumentAPI,
  updateDocumentChunk,
  updatePipeline,
  uploadDocument
} from '@/servers'
import type {
  DashboardData,
  KnowledgeBase,
  KnowledgeBaseCreatePayload,
  KnowledgeChunk,
  KnowledgeChunkCreatePayload,
  KnowledgeDocument,
  KnowledgeDocumentChunkLog,
  KnowledgeChunkUpdatePayload,
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

export const useAdminStore = defineStore('admin', () => {
  const dashboard = ref<DashboardData | null>(null)
  const knowledgeBases = ref<KnowledgeBase[]>([])
  const documentsByKb = ref<Record<string, KnowledgeDocument[]>>({})
  const chunksByDocument = ref<Record<string, KnowledgeChunk[]>>({})
  const selectedDocument = ref<KnowledgeDocument | null>(null)
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

  const mapSharedDocumentToView = (
    document: import('share-type').KnowledgeDocument,
    previous?: KnowledgeDocument | null
  ): KnowledgeDocument => {
    return {
      ...(previous ?? {}),
      ...document,
      type: document.fileType?.toUpperCase() ?? (document.sourceType === 'url' ? 'URL' : 'FILE'),
      status: document.status,
      source: document.sourceLocation || document.storagePath || '',
      summary: document.summary ?? '',
      chunkStrategy: document.chunkStrategy ?? undefined,
      chunkConfig: document.chunkConfig ? JSON.stringify(document.chunkConfig) : undefined,
      sourceLocation: document.sourceLocation ?? undefined,
      storagePath: document.storagePath ?? undefined,
      fileType: document.fileType ?? undefined,
      fileSize: document.fileSizeBytes ?? undefined,
      contentPreview: document.contentPreview ?? undefined,
      knowledgeBaseId: document.knowledgeBaseId
    }
  }

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

  const createKnowledgeBase = async (payload: KnowledgeBaseCreatePayload) => {
    const created = await createKnowledgeBaseEntry(payload)
    knowledgeBases.value = [created, ...knowledgeBases.value]
    documentsByKb.value = {
      ...documentsByKb.value,
      [created.id]: []
    }
    return created
  }

  const renameKnowledgeBase = async (kbId: string, name: string) => {
    const updated = await renameKnowledgeBaseEntry(kbId, name)
    if (!updated) return null
    knowledgeBases.value = knowledgeBases.value.map((item) => (item.id === kbId ? updated : item))
    return updated
  }

  const removeKnowledgeBase = async (kbId: string) => {
    const response = await deleteKnowledgeBaseAPI(kbId)
    const deleted = response.data
    if (!deleted) return false
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
    selectedDocument.value = await fetchDocumentDetail(kbId, docId)
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
    const response = await updateKnowledgeDocumentAPI(docId, {
      name: payload.name.trim(),
      chunkStrategy: payload.chunkStrategy?.trim(),
      chunkConfig: payload.chunkConfig ? JSON.parse(payload.chunkConfig) : undefined
    })
    const updated = response.data

    if (!updated) {
      return null
    }

    const previous =
      selectedDocument.value?.id === docId
        ? selectedDocument.value
        : (documentsByKb.value[kbId] ?? []).find((document) => document.id === docId) ?? null

    const mappedUpdated = mapSharedDocumentToView(updated, previous)

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
    const deleted = response.data
    if (!deleted) {
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

  const setDocumentEnabled = async (kbId: string, docId: string, enabled: boolean) => {
    const updated = await toggleDocumentEnabled(kbId, docId, enabled)
    if (!updated) {
      return null
    }

    documentsByKb.value = {
      ...documentsByKb.value,
      [kbId]: (documentsByKb.value[kbId] ?? []).map((document) =>
        document.id === docId ? updated : document
      )
    }

    if (selectedDocument.value?.id === docId) {
      selectedDocument.value = updated
    }

    return updated
  }

  const runDocumentChunk = async (kbId: string, docId: string) => {
    const updated = await startDocumentChunk(kbId, docId)
    if (!updated) {
      return null
    }

    documentsByKb.value = {
      ...documentsByKb.value,
      [kbId]: (documentsByKb.value[kbId] ?? []).map((document) =>
        document.id === docId ? updated : document
      )
    }

    if (selectedDocument.value?.id === docId) {
      selectedDocument.value = updated
    }

    await loadDocumentChunks(docId)

    return updated
  }

  const uploadKnowledgeDocument = async (
    kbId: string,
    payload: KnowledgeDocumentUploadPayload
  ) => {
    const created = await uploadDocument(kbId, payload)
    documentsByKb.value = {
      ...documentsByKb.value,
      [kbId]: [created, ...(documentsByKb.value[kbId] ?? [])]
    }
    await loadKnowledgeBases()
    return created
  }

  const loadDocumentChunkLogs = async (docId: string) => {
    const logs = await fetchDocumentChunkLogs(docId)
    chunkLogs.value = {
      ...chunkLogs.value,
      [docId]: logs
    }
    return logs
  }

  const updateChunk = async (
    kbId: string,
    docId: string,
    chunkId: string,
    payload: KnowledgeChunkUpdatePayload
  ) => {
    const updated = await updateDocumentChunk(kbId, docId, chunkId, payload)
    if (!updated) return null
    chunksByDocument.value = {
      ...chunksByDocument.value,
      [docId]: (chunksByDocument.value[docId] ?? []).map((item) => (item.id === chunkId ? updated : item))
    }
    await loadDocuments(kbId)
    if (selectedDocument.value?.id === docId) {
      await loadDocumentDetail(kbId, docId)
    }
    return updated
  }

  const createChunk = async (
    kbId: string,
    docId: string,
    payload: KnowledgeChunkCreatePayload
  ) => {
    const created = await createDocumentChunk(kbId, docId, payload)
    chunksByDocument.value = {
      ...chunksByDocument.value,
      [docId]: [...(chunksByDocument.value[docId] ?? []), created]
    }
    await loadDocuments(kbId)
    if (selectedDocument.value?.id === docId) {
      await loadDocumentDetail(kbId, docId)
    }
    return created
  }

  const deleteChunk = async (kbId: string, docId: string, chunkId: string) => {
    const response = await deleteKnowledgeChunkAPI(chunkId)
    const deleted = response.data
    if (!deleted) return false
    chunksByDocument.value = {
      ...chunksByDocument.value,
      [docId]: (chunksByDocument.value[docId] ?? []).filter((item) => item.id !== chunkId)
    }
    await loadDocuments(kbId)
    if (selectedDocument.value?.id === docId) {
      await loadDocumentDetail(kbId, docId)
    }
    return true
  }

  const setChunkEnabled = async (kbId: string, docId: string, chunkId: string, enabled: boolean) => {
    const updated = await toggleDocumentChunkEnabled(kbId, docId, chunkId, enabled)
    if (!updated) return null
    chunksByDocument.value = {
      ...chunksByDocument.value,
      [docId]: (chunksByDocument.value[docId] ?? []).map((item) => (item.id === chunkId ? updated : item))
    }
    await loadDocuments(kbId)
    if (selectedDocument.value?.id === docId) {
      await loadDocumentDetail(kbId, docId)
    }
    return updated
  }

  const rebuildEmbeddings = async (kbId: string, docId: string) => {
    const updated = await rebuildDocumentEmbeddings(kbId, docId)
    if (!updated) return null
    documentsByKb.value = {
      ...documentsByKb.value,
      [kbId]: (documentsByKb.value[kbId] ?? []).map((document) =>
        document.id === docId ? updated : document
      )
    }
    if (selectedDocument.value?.id === docId) {
      selectedDocument.value = updated
    }
    return updated
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
    setDocumentEnabled,
    runDocumentChunk,
    uploadKnowledgeDocument,
    loadDocumentChunkLogs,
    updateChunk,
    createChunk,
    deleteChunk,
    setChunkEnabled,
    rebuildEmbeddings,
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
