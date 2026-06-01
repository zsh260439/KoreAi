import type {
  CreateKnowledgeBaseInput,
  CreateKnowledgeDocumentInput,
  KnowledgeBase as SharedKnowledgeBase,
  KnowledgeChunk as SharedKnowledgeChunk,
  KnowledgeDocument as SharedKnowledgeDocument,
  UpdateKnowledgeDocumentInput
} from 'share-type'

export type CreateKnowledgeBaseDto = CreateKnowledgeBaseInput

// 后端真实契约类型：以后端 / shared contract 为准
export type KnowledgeBase = SharedKnowledgeBase

export type KnowledgeDocument = SharedKnowledgeDocument

export type KnowledgeChunk = SharedKnowledgeChunk

// 前端管理台视图类型：只给当前 admin/mock 页面使用
export interface KnowledgeBaseView extends KnowledgeBase {
  owner?: string
  collectionName?: string
  createdBy?: string
}

export interface KnowledgeDocumentView extends KnowledgeDocument {
  type?: string
  source?: string
  processMode?: 'chunk' | 'pipeline' | string
  chunkConfigText?: string
  pipelineId?: string
  pipelineName?: string
  scheduleEnabled?: boolean
  scheduleCron?: string
  fileSize?: number
}

// 真实接口请求类型
export type CreateKnowledgeDocumentPayload = CreateKnowledgeDocumentInput

export type KnowledgeDocumentUpdatePayload = UpdateKnowledgeDocumentInput

// 当前前端页面编辑 / 上传表单类型
export interface KnowledgeDocumentUpdateForm {
  name: string
  processMode: 'chunk' | 'pipeline'
  chunkStrategy?: string
  chunkConfigText?: string
  sourceLocation?: string
  scheduleEnabled?: boolean
  scheduleCron?: string
  pipelineId?: string
}

export interface KnowledgeDocumentUploadForm extends KnowledgeDocumentUpdateForm {
  sourceType: 'file' | 'url'
  file?: File | null
}

export interface KnowledgeBaseCreatePayload {
  name: string
  description?: string
  owner?: string
}

export interface KnowledgeChunkCreatePayload {
  content: string
  enabled?: boolean
}

export interface KnowledgeChunkUpdatePayload {
  content: string
}

export interface KnowledgeDocumentChunkLog {
  id: string
  documentId: string
  status: KnowledgeDocument['status']
  sourceType?: KnowledgeDocument['sourceType']
  processMode?: KnowledgeDocumentView['processMode']
  chunkStrategy?: string
  pipelineId?: string
  pipelineName?: string
  chunkCount?: number
  extractDuration?: number
  chunkDuration?: number
  embedDuration?: number
  persistDuration?: number
  otherDuration?: number
  totalDuration?: number
  updatedAt?: string
}
