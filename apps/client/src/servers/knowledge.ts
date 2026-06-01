import { request } from '@/http-utils/http'
import type {
  CreateKnowledgeBaseInput,
  CreateKnowledgeDocumentInput,
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
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

// 根据知识库ID获取下属所有文档
export const findKnowledgeDocumentsAPI = (kbId: string) => {
  return request<KnowledgeDocument[]>(`knowledge/bases/${kbId}/documents`)
}

// 在指定知识库下创建文档
export const createKnowledgeDocumentAPI = (kbId: string, dto: CreateKnowledgeDocumentInput) => {
  return request<KnowledgeDocument>(`knowledge/bases/${kbId}/documents`, 'POST', dto)
}

// 根据文档ID获取下属所有分片
export const findDocumentChunksAPI = (docId: string) => {
  return request<KnowledgeChunk[]>(`knowledge/documents/${docId}/chunks`)
}

// 重建文档的分片内容
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

// 删除指定分片
export const deleteKnowledgeChunkAPI = (chunkId: string) => {
  return request<KnowledgeChunk>(`knowledge/chunks/${chunkId}`, 'DELETE')
}