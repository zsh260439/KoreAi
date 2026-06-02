import {
  cloneMock,
  createKnowledgeBase,
  createPipelineDefinition,
  dashboardData,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  deletePipelineDefinition,
  documentChunkLogs,
  fetchKnowledgeChunks,
  knowledgeBases,
  knowledgeDocuments,
  pipelineDefinitions,
  pipelineTasks,
  renameKnowledgeBase,
  searchSuggestionGroups,
  startKnowledgeDocumentChunk,
  systemSettings,
  traces,
  updateKnowledgeDocument,
  updatePipelineDefinition,
  uploadKnowledgeDocument,
  wait
} from '@/utils'
import type {
  KnowledgeBaseCreatePayload,
  KnowledgeDocumentUpdatePayload,
  KnowledgeDocumentUploadPayload,
  PipelineDefinitionPayload
} from '@/types'

export const fetchDashboardData = async () => {
  await wait()
  return cloneMock(dashboardData)
}

export const fetchKnowledgeBases = async () => {
  await wait()
  return cloneMock(knowledgeBases)
}

export const createKnowledgeBaseEntry = async (payload: KnowledgeBaseCreatePayload) => {
  await wait(180)
  return createKnowledgeBase(payload)
}

export const renameKnowledgeBaseEntry = async (kbId: string, name: string) => {
  await wait(160)
  return renameKnowledgeBase(kbId, name)
}

export const removeKnowledgeBaseEntry = async (kbId: string) => {
  await wait(180)
  return deleteKnowledgeBase(kbId)
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

export const fetchDocumentChunks = async (docId: string) => {
  await wait(180)
  return fetchKnowledgeChunks(docId)
}

export const fetchPipelines = async () => {
  await wait()
  return cloneMock(pipelineDefinitions)
}

export const fetchPipelineTasks = async () => {
  await wait()
  return cloneMock(pipelineTasks)
}

export const createPipeline = async (payload: PipelineDefinitionPayload) => {
  await wait(220)
  return createPipelineDefinition(payload)
}

export const updatePipeline = async (pipelineId: string, payload: PipelineDefinitionPayload) => {
  await wait(220)
  return updatePipelineDefinition(pipelineId, payload)
}

export const deletePipeline = async (pipelineId: string) => {
  await wait(180)
  return deletePipelineDefinition(pipelineId)
}

export const fetchTraces = async () => {
  await wait()
  return cloneMock(traces)
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
