export type KnowledgeBaseStatus = 'active' | 'draft'

export type KnowledgeDocumentStatus =
  | 'pending'
  | 'processing'
  | 'indexed'
  | 'failed'

export type KnowledgeDocumentSourceType = 'file'

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  status: KnowledgeBaseStatus
  documentCount: number
  embeddingModel?: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocument {
  id: string
  knowledgeBaseId: string
  name: string
  sourceType: KnowledgeDocumentSourceType
  storagePath: string
  fileType: string
  fileSizeBytes: number | null
  status: KnowledgeDocumentStatus
  enabled: boolean
  chunkStrategy: string | null
  chunkConfig: Record<string, unknown> | null
  chunkCount: number
  summary: string | null
  contentPreview: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeChunk {
  id: string
  documentId: string
  sequence: number
  content: string
  enabled: boolean
  charCount: number
  tokenCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateKnowledgeBaseInput {
  name: string
  description?: string
}

export interface CreateKnowledgeDocumentInput {
  name: string
  storagePath: string
  chunkStrategy?: string
  chunkConfig?: Record<string, unknown>
}
