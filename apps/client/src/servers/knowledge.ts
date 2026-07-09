import { request } from '@/http-utils/http'
import type {
  CreateKnowledgeBaseInput,
  CreateKnowledgeDocumentInput,
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeSearchInput,
  KnowledgeSearchResponse,
  StructureAwareChunkConfig,
  UpdateKnowledgeBaseInput,
  UpdateKnowledgeDocumentInput
} from 'share-type'

// 创建知识库
export const createKnowledgeBaseAPI = (dto: CreateKnowledgeBaseInput) => {
  return request<KnowledgeBase>('knowledge/bases', 'POST', dto)
}

// 获取所有知识库
export const findKnowledgeBasesAPI = () => {
  return request<KnowledgeBase[]>('knowledge/bases')
}

// 更新知识库
export const updateKnowledgeBaseAPI = (kbId: string, dto: UpdateKnowledgeBaseInput) => {
  return request<KnowledgeBase>(`knowledge/bases/${kbId}`, 'PATCH', dto)
}

// 在指定知识库下搜索命中的 chunks
export const searchKnowledgeAPI = (dto: KnowledgeSearchInput) => {
  return request<KnowledgeSearchResponse>('knowledge/search', 'POST', dto)
}

// 根据知识库 ID 获取文档列表
export const findKnowledgeDocumentsAPI = (kbId: string) => {
  return request<KnowledgeDocument[]>(`knowledge/bases/${kbId}/documents`)
}

// 获取单个文档详情
export const findKnowledgeDocumentAPI = (docId: string) => {
  return request<KnowledgeDocument>(`knowledge/documents/${docId}`)
}

// 在指定知识库下创建文档
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

// 根据文档 ID 获取分块列表
export const findDocumentChunksAPI = (docId: string) => {
  return request<KnowledgeChunk[]>(`knowledge/documents/${docId}/chunks`)
}

// 根据当前文档配置重新分块
export const rebuildDocumentChunksAPI = (docId: string) => {
  return request<KnowledgeChunk[]>(`knowledge/documents/${docId}/chunks/rebuild`, 'POST')
}

// 更新文档信息
export const updateKnowledgeDocumentAPI = (docId: string, dto: UpdateKnowledgeDocumentInput) => {
  return request<KnowledgeDocument>(`knowledge/documents/${docId}`, 'PATCH', dto)
}

// 删除指定文档
export const deleteKnowledgeDocumentAPI = (docId: string) => {
  return request<KnowledgeDocument>(`knowledge/documents/${docId}`, 'DELETE')
}

// 删除指定知识库
export const deleteKnowledgeBaseAPI = (kbId: string) => {
  return request<KnowledgeBase>(`knowledge/bases/${kbId}`, 'DELETE')
}
