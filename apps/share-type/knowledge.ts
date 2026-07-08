export type KnowledgeBaseStatus = 'active' | 'draft'

export type KnowledgeDocumentStatus = 'pending' | 'processing' | 'indexed' | 'failed'

export type KnowledgeDocumentSourceType = 'file' | 'url'

export interface StructureAwareChunkConfig {
  targetChars: number
  maxChars: number
  minChars: number
  overlapChars: number
}

export type KnowledgeQaDeltaEvent =
  | {
      type: 'thinking_delta'
      delta: string
    }
  | {
      type: 'answer_delta'
      delta: string
    }

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
  chunkConfig?: StructureAwareChunkConfig
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  status: KnowledgeBaseStatus
  documentCount: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocument {
  id: string
  knowledgeBaseId: string
  name: string
  sourceType: KnowledgeDocumentSourceType
  storagePath: string | null
  fileType: string | null
  fileSizeBytes: number | null
  status: KnowledgeDocumentStatus
  chunkConfig: StructureAwareChunkConfig | null
  chunkCount: number
  contentPreview: string | null
  createdAt: string
  updatedAt: string
}

//声明知识分块结构块类型
export interface KnowledgeChunkBlock {
  blockType: string
  content: string
  title?: string
  pageNumber?: number
  level?: number
  sectionPath: string[]
  startOffset?: number
  endOffset?: number
  metadata?: Record<string, unknown> | null
}

//声明知识分块元数据结构
export interface KnowledgeChunkMetadata {
  knowledgeBaseId: string
  documentId: string
  documentName: string
  fileType?: string
  sourceKind?: string
  blockTypes?: string[]
  pageNumbers?: number[]
  sectionPaths?: string[][]
  titles?: string[]
  levels?: number[]
  startOffsets?: number[]
  endOffsets?: number[]
  blockMetadatas?: Array<Record<string, unknown>>
  blocks?: KnowledgeChunkBlock[]
}

export interface KnowledgeChunk {
  id: string
  documentId: string
  sequence: number
  content: string
  charCount: number
  tokenCount: number
  metadata: KnowledgeChunkMetadata | null
  createdAt: string
  updatedAt: string
}

export interface UpdateKnowledgeDocumentInput {
  name?: string
  chunkConfig?: StructureAwareChunkConfig
}

export interface KnowledgeSearchInput {
  query: string
  knowledgeBaseId?: string
}

export type KnowledgeRetrievalSource = 'bm25' | 'vector'

export interface KnowledgeSearchScoreDetail {
  matchedBy: KnowledgeRetrievalSource[]
  bm25Score: number | null
  vectorScore: number | null
  fusedScore: number
}

export interface KnowledgeSearchHit {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  score: number
  scoreDetail?: KnowledgeSearchScoreDetail
}
export type KnowledgeReasoningStepKey =
  | 'knowledge_recall'
  | 'llm_reasoning'
  | 'answer_synthesis'
  | 'deepsearch'
  | 'web_search'

//声明知识推理步骤结构
export interface KnowledgeReasoningStep {
  stageKey: KnowledgeReasoningStepKey
  title: string
  subtitle?: string
  content: string
}
