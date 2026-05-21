import {
  cloneMock,
  dashboardData,
  deleteKnowledgeDocument,
  documentChunkLogs,
  knowledgeBases,
  knowledgeDocuments,
  mappings,
  pipelineItems,
  pipelineTasks,
  sampleQuestions,
  searchSuggestionGroups,
  startKnowledgeDocumentChunk,
  systemSettings,
  traces,
  traceDetails,
  toggleKnowledgeDocumentEnabled,
  updateKnowledgeDocument,
  uploadKnowledgeDocument,
  users,
  wait,
  intentTree
} from '@/utils/mock'
import type {
  KnowledgeDocumentUpdatePayload,
  KnowledgeDocumentUploadPayload
} from '@/types/models'

export async function fetchDashboardData() {
  await wait()
  return cloneMock(dashboardData)
}

export async function fetchKnowledgeBases() {
  await wait()
  return cloneMock(knowledgeBases)
}

export async function fetchKnowledgeDocuments(kbId: string) {
  await wait()
  return cloneMock(knowledgeDocuments[kbId] ?? [])
}

export async function fetchDocumentDetail(kbId: string, docId: string) {
  await wait(200)
  const document = (knowledgeDocuments[kbId] ?? []).find((item) => item.id === docId) ?? null
  return cloneMock(document)
}

export async function updateDocumentDetail(
  kbId: string,
  docId: string,
  payload: KnowledgeDocumentUpdatePayload
) {
  await wait(220)
  return updateKnowledgeDocument(kbId, docId, payload)
}

export async function deleteDocument(kbId: string, docId: string) {
  await wait(200)
  return deleteKnowledgeDocument(kbId, docId)
}

export async function toggleDocumentEnabled(kbId: string, docId: string, enabled: boolean) {
  await wait(180)
  return toggleKnowledgeDocumentEnabled(kbId, docId, enabled)
}

export async function startDocumentChunk(kbId: string, docId: string) {
  await wait(220)
  return startKnowledgeDocumentChunk(kbId, docId)
}

export async function uploadDocument(kbId: string, payload: KnowledgeDocumentUploadPayload) {
  await wait(260)
  return uploadKnowledgeDocument(kbId, payload)
}

export async function fetchDocumentChunkLogs(docId: string) {
  await wait(180)
  return cloneMock(documentChunkLogs[docId] ?? [])
}

export async function fetchPipelines() {
  await wait()
  return cloneMock(pipelineItems)
}

export async function fetchPipelineTasks() {
  await wait()
  return cloneMock(pipelineTasks)
}

export async function fetchIntentTree() {
  await wait()
  return cloneMock(intentTree)
}

export async function fetchIntentList() {
  await wait()
  return cloneMock(intentTree.flatMap((item) => [item, ...(item.children ?? [])]))
}

export async function fetchMappings() {
  await wait()
  return cloneMock(mappings)
}

export async function fetchTraces() {
  await wait()
  return cloneMock(traces)
}

export async function fetchTraceDetail(traceId: string) {
  await wait(220)
  return cloneMock(traceDetails[traceId] ?? null)
}

export async function fetchSampleQuestions() {
  await wait()
  return cloneMock(sampleQuestions)
}

export async function fetchUsers() {
  await wait()
  return cloneMock(users)
}

export async function fetchSystemSettings() {
  await wait()
  return cloneMock(systemSettings)
}

export async function fetchSearchSuggestions(query: string) {
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
