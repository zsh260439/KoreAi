import {
  cloneMock,
  dashboardData,
  deleteKnowledgeDocument,
  documentChunkLogs,
  knowledgeBases,
  knowledgeDocuments,
  pipelineItems,
  pipelineTasks,
  searchSuggestionGroups,
  startKnowledgeDocumentChunk,
  systemSettings,
  traces,
  traceDetails,
  toggleKnowledgeDocumentEnabled,
  updateKnowledgeDocument,
  uploadKnowledgeDocument,
  wait
} from '@/utils/mock'
import type {
  KnowledgeDocumentUpdatePayload,
  KnowledgeDocumentUploadPayload
} from '@/types/models'

export const fetchDashboardData = async () => {
  await wait()
  return cloneMock(dashboardData)
}

export const fetchKnowledgeBases = async () => {
  await wait()
  return cloneMock(knowledgeBases)
}

export const fetchKnowledgeDocuments = async (kbId: string) => {
  await wait()
  return cloneMock(knowledgeDocuments[kbId] ?? [])
}

export const fetchDocumentDetail = async (kbId: string, docId: string) => {
  await wait(200)
  const document = (knowledgeDocuments[kbId] ?? []).find((item) => item.id === docId) ?? null
  return cloneMock(document)
}

export const updateDocumentDetail = async (
  kbId: string,
  docId: string,
  payload: KnowledgeDocumentUpdatePayload
) => {
  await wait(220)
  return updateKnowledgeDocument(kbId, docId, payload)
}

export const deleteDocument = async (kbId: string, docId: string) => {
  await wait(200)
  return deleteKnowledgeDocument(kbId, docId)
}

export const toggleDocumentEnabled = async (kbId: string, docId: string, enabled: boolean) => {
  await wait(180)
  return toggleKnowledgeDocumentEnabled(kbId, docId, enabled)
}

export const startDocumentChunk = async (kbId: string, docId: string) => {
  await wait(220)
  return startKnowledgeDocumentChunk(kbId, docId)
}

export const uploadDocument = async (kbId: string, payload: KnowledgeDocumentUploadPayload) => {
  await wait(260)
  return uploadKnowledgeDocument(kbId, payload)
}

export const fetchDocumentChunkLogs = async (docId: string) => {
  await wait(180)
  return cloneMock(documentChunkLogs[docId] ?? [])
}

export const fetchPipelines = async () => {
  await wait()
  return cloneMock(pipelineItems)
}

export const fetchPipelineTasks = async () => {
  await wait()
  return cloneMock(pipelineTasks)
}

export const fetchTraces = async () => {
  await wait()
  return cloneMock(traces)
}

export const fetchTraceDetail = async (traceId: string) => {
  await wait(220)
  return cloneMock(traceDetails[traceId] ?? null)
}

export const fetchSystemSettings = async () => {
  await wait()
  return cloneMock(systemSettings)
}

export const fetchSearchSuggestions = async (query: string) => {
  await wait(180)

  if (!query.trim()) {
    return cloneMock(searchSuggestionGroups)
  }

  const lowered = query.toLowerCase()

  const filtered = searchSuggestionGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.title.toLowerCase().includes(lowered) ||
          item.description.toLowerCase().includes(lowered)
      )
    }))
    .filter((group) => group.items.length > 0)

  return cloneMock(filtered)
}
