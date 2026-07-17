import { request } from '@/http-utils/http'
import type {
  CreateKnowledgeBaseInput,
  CreateKnowledgeDocumentInput,
  KnowledgeBase,
  KnowledgeBaseRuntimeConfigPatch,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeGlobalRuntimeSettings,
  KnowledgeProviderRuntimeConfigPatch,
  KnowledgeProviderSettings,
  KnowledgeSearchInput,
  KnowledgeSearchResponse,
  StructureAwareChunkConfig,
  UpdateKnowledgeBaseInput,
  UpdateKnowledgeDocumentInput
} from 'share-type'

export const createKnowledgeBaseAPI = (dto: CreateKnowledgeBaseInput) => {
  return request<KnowledgeBase>('knowledge/bases', 'POST', dto)
}

export const findKnowledgeBasesAPI = () => {
  return request<KnowledgeBase[]>('knowledge/bases')
}

export const findGlobalRuntimeConfigAPI = () => {
  return request<KnowledgeGlobalRuntimeSettings>('knowledge/runtime-config/global')
}

export const updateGlobalRuntimeConfigAPI = (dto: KnowledgeBaseRuntimeConfigPatch) => {
  return request<KnowledgeGlobalRuntimeSettings>('knowledge/runtime-config/global', 'PATCH', dto)
}

export const findProviderSettingsAPI = () => {
  return request<KnowledgeProviderSettings>('knowledge/provider-settings')
}

export const updateProviderSettingsAPI = (dto: KnowledgeProviderRuntimeConfigPatch) => {
  return request<KnowledgeProviderSettings>('knowledge/provider-settings', 'PATCH', dto)
}

export const updateKnowledgeBaseAPI = (kbId: string, dto: UpdateKnowledgeBaseInput) => {
  return request<KnowledgeBase>(`knowledge/bases/${kbId}`, 'PATCH', dto)
}

export const searchKnowledgeAPI = (dto: KnowledgeSearchInput) => {
  return request<KnowledgeSearchResponse>('knowledge/search', 'POST', dto)
}

export const findKnowledgeDocumentsAPI = (kbId: string) => {
  return request<KnowledgeDocument[]>(`knowledge/bases/${kbId}/documents`)
}

export const findKnowledgeDocumentAPI = (docId: string) => {
  return request<KnowledgeDocument>(`knowledge/documents/${docId}`)
}

export const createKnowledgeDocumentAPI = (kbId: string, dto: CreateKnowledgeDocumentInput) => {
  return request<KnowledgeDocument>(`knowledge/bases/${kbId}/documents`, 'POST', dto)
}

export const uploadKnowledgeDocumentAPI = (
  kbId: string,
  payload: { file: File; name: string; chunkConfig?: StructureAwareChunkConfig }
) => {
  const formData = new FormData()
  formData.append('file', payload.file)
  formData.append('name', payload.name)

  if (payload.chunkConfig) {
    formData.append('chunkConfig', JSON.stringify(payload.chunkConfig))
  }

  return request<KnowledgeDocument>(`knowledge/bases/${kbId}/documents/upload`, 'POST', formData)
}

export const findDocumentChunksAPI = (docId: string) => {
  return request<KnowledgeChunk[]>(`knowledge/documents/${docId}/chunks`)
}

export const rebuildDocumentChunksAPI = (docId: string) => {
  return request<KnowledgeChunk[]>(`knowledge/documents/${docId}/chunks/rebuild`, 'POST', undefined, {
    timeout: 120000
  })
}

export const updateKnowledgeDocumentAPI = (docId: string, dto: UpdateKnowledgeDocumentInput) => {
  return request<KnowledgeDocument>(`knowledge/documents/${docId}`, 'PATCH', dto)
}

export const deleteKnowledgeDocumentAPI = (docId: string) => {
  return request<KnowledgeDocument>(`knowledge/documents/${docId}`, 'DELETE')
}

export const deleteKnowledgeBaseAPI = (kbId: string) => {
  return request<KnowledgeBase>(`knowledge/bases/${kbId}`, 'DELETE')
}
