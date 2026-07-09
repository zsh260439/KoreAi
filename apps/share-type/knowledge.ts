export type KnowledgeBaseStatus = 'active' | 'draft'
export type KnowledgeRuntimeConfigScope = 'global' | 'knowledge_base'

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

// 声明知识库级召回运行配置，所有影响召回行为的关键参数统一收口在这里。
export interface KnowledgeBaseRetrievalRuntimeConfig {
  previewTopK: number
  workspaceTopK: number
  candidateMultiplier: number
  minCandidateLimit: number
  maxCandidateLimit: number
  bm25Weight: number
  vectorWeight: number
  queryAnalysisEnabled: boolean
  queryAnalysisTemperature: number
}

// 声明回答阶段运行配置，当前先暴露最关键的 temperature。
export interface KnowledgeBaseAnswerRuntimeConfig {
  temperature: number
}

// 声明完整运行配置，前后端都以它作为单一事实来源。
export interface KnowledgeBaseRuntimeConfig {
  retrieval: KnowledgeBaseRetrievalRuntimeConfig
  answer: KnowledgeBaseAnswerRuntimeConfig
}

// 声明召回配置补丁，允许 admin 按字段局部更新。
export interface KnowledgeBaseRetrievalRuntimeConfigPatch
  extends Partial<KnowledgeBaseRetrievalRuntimeConfig> {}

// 声明回答配置补丁，便于只更新单个生成参数。
export interface KnowledgeBaseAnswerRuntimeConfigPatch
  extends Partial<KnowledgeBaseAnswerRuntimeConfig> {}

// 声明运行配置补丁，作为更新接口的真实输入契约。
export interface KnowledgeBaseRuntimeConfigPatch {
  retrieval?: KnowledgeBaseRetrievalRuntimeConfigPatch
  answer?: KnowledgeBaseAnswerRuntimeConfigPatch
}

// 声明共享默认配置，前后端恢复默认值都复用它，避免各自维护常量。
export const DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG: KnowledgeBaseRuntimeConfig = {
  retrieval: {
    previewTopK: 20,
    workspaceTopK: 4,
    candidateMultiplier: 4,
    minCandidateLimit: 20,
    maxCandidateLimit: 80,
    bm25Weight: 1,
    vectorWeight: 1,
    queryAnalysisEnabled: true,
    queryAnalysisTemperature: 0.1
  },
  answer: {
    temperature: 0.2
  }
}

export interface CreateKnowledgeBaseInput {
  name: string
  description?: string
}

export interface UpdateKnowledgeBaseInput {
  name?: string
  description?: string
  runtimeConfig?: KnowledgeBaseRuntimeConfigPatch
}

// 声明全局运行配置更新输入，避免接口混入知识库名称等无关字段。
export interface UpdateKnowledgeRuntimeConfigInput {
  runtimeConfig: KnowledgeBaseRuntimeConfigPatch
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
  runtimeConfig: KnowledgeBaseRuntimeConfig
  createdAt: string
  updatedAt: string
}

// 声明全局召回配置结构，用于未指定知识库的全库召回路径。
export interface KnowledgeGlobalRuntimeSettings {
  scope: 'global'
  runtimeConfig: KnowledgeBaseRuntimeConfig
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

// 声明分块内部 block 结构，便于调试和详情页按块展示。
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

// 声明分块元数据结构，承接分块详情和检索调试信息。
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
  rewrite?: boolean
}

export type KnowledgeRetrievalSource = 'bm25' | 'vector'

// 声明单次检索调试快照，前端据此展示 rewrite 和双路召回细节。
export interface KnowledgeSearchDebugInfo {
  originalQuery: string
  normalizedQuery: string
  bm25Query: string
  vectorQuery: string
  rewriteApplied: boolean
  retrievalMode: string
  bm25Weight: number
  vectorWeight: number
  bm25HitCount: number
  vectorHitCount: number
}

// 声明单条命中的分数细节，避免 UI 只能看到最终融合分。
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

// 声明搜索接口返回结构，把命中列表与调试信息拆开。
export interface KnowledgeSearchResponse {
  hits: KnowledgeSearchHit[]
  debug: KnowledgeSearchDebugInfo | null
}

export type KnowledgeReasoningStepKey =
  | 'knowledge_recall'
  | 'llm_reasoning'
  | 'answer_synthesis'
  | 'deepsearch'
  | 'web_search'

// 声明知识推理步骤结构，用于 workspace 思考面板展示。
export interface KnowledgeReasoningStep {
  stageKey: KnowledgeReasoningStepKey
  title: string
  subtitle?: string
  content: string
}
