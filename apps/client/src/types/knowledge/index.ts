import type {
  CreateKnowledgeBaseInput,
  CreateKnowledgeDocumentInput,
  KnowledgeBase as SharedKnowledgeBase,
  KnowledgeChunk as SharedKnowledgeChunk,
  KnowledgeDocument as SharedKnowledgeDocument,
  KnowledgeDocumentSourceType,
  KnowledgeDocumentStatus,
  UpdateKnowledgeDocumentInput
} from 'share-type'

export type CreateKnowledgeBaseDto = CreateKnowledgeBaseInput

// knowledge 页面已对接真实后端，这里保留少量可选展示字段给管理页使用
export type KnowledgeBase = Omit<SharedKnowledgeBase, 'status'> & {
  status: SharedKnowledgeBase['status'] | 'syncing'
  owner?: string
  collectionName?: string
  createdBy?: string
}

export type KnowledgeBaseView = KnowledgeBase

export type KnowledgeDocument = Omit<
  SharedKnowledgeDocument,
  'status' | 'sourceLocation' | 'storagePath' | 'fileSizeBytes' | 'chunkStrategy' | 'chunkConfig' | 'enabled'
> & {
  status: KnowledgeDocumentStatus | 'success' | 'running'
  enabled?: boolean
  sourceLocation?: string | null
  storagePath?: string | null
  fileSizeBytes?: number | null
  chunkStrategy?: string | null
  chunkConfig?: SharedKnowledgeDocument['chunkConfig'] | string | null
  type?: string
  source?: string
  fileSize?: number | null
  chunkConfigText?: string
}

export type AdminKnowledgeDocument = KnowledgeDocument
export type KnowledgeDocumentView = KnowledgeDocument
export type KnowledgeChunk = SharedKnowledgeChunk & {
  enabled?: boolean
}

export interface CreateKnowledgeDocumentPayload extends CreateKnowledgeDocumentInput {}

export interface KnowledgeDocumentUpdatePayload {
  name: string
  chunkStrategy?: string
  chunkConfig?: string
  sourceLocation?: string
}

export interface KnowledgeDocumentUploadPayload {
  name: string
  storagePath?: string
  chunkStrategy?: string
  chunkConfig?: string
  sourceType?: KnowledgeDocumentSourceType
  sourceLocation?: string
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
  status: KnowledgeDocumentStatus | 'success' | 'running'
  sourceType?: KnowledgeDocumentSourceType
  chunkStrategy?: string | null
  chunkCount?: number
  extractDuration?: number
  chunkDuration?: number
  embedDuration?: number
  persistDuration?: number
  otherDuration?: number
  totalDuration?: number
  updatedAt?: string
}

export type SharedKnowledgeDocumentUpdateInput = UpdateKnowledgeDocumentInput
export type KnowledgeDocumentUpdateForm = KnowledgeDocumentUpdatePayload
export type KnowledgeDocumentUploadForm = KnowledgeDocumentUploadPayload
