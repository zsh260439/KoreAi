export type KnowledgeBaseStatus = 'active' | 'draft'

export type KnowledgeDocumentStatus = 'pending' | 'processing' | 'indexed' | 'failed'

export type KnowledgeDocumentSourceType = 'file' | 'url'

export interface CreateKnowledgeBaseInput {
  name: string
  description?: string
}

export interface UpdateKnowledgeBaseInput {
  name?: string
  description?: string
}

export interface CreateKnowledgeDocumentInput {
  name: string
  storagePath: string
  chunkStrategy?: string
  chunkConfig?: Record<string, unknown>
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  status: KnowledgeBaseStatus
  documentCount: number
  embeddingModel: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocument {
  id: string
  knowledgeBaseId: string
  name: string
  sourceType: KnowledgeDocumentSourceType
  sourceLocation: string | null
  storagePath: string | null
  fileType: string | null
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
  charCount: number
  tokenCount: number
  createdAt: string
  updatedAt: string
}

export interface UpdateKnowledgeDocumentInput {
  name?: string
  chunkStrategy?: string
  chunkConfig?: Record<string, unknown>
}

export interface KnowledgeSearchInput {
  query: string
  knowledgeBaseId?: string
}

export interface KnowledgeSearchHit {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  score: number
}

export interface KnowledgeAskInput {
  query: string
  knowledgeBaseId?: string
  topK?: number
}

export interface KnowledgeAskResult {
  answer: string
  sources: KnowledgeSearchHit[]
  model: string | null
}
