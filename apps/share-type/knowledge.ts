export type KnowledgeBaseStatus =
  /** 知识库已启用，可参与检索和问答。 */
  | 'active'
  /** 知识库草稿态，通常还未准备好对外使用。 */
  | 'draft'

export type KnowledgeDocumentStatus =
  /** 文档已创建但尚未进入解析和索引流程。 */
  | 'pending'
  /** 文档正在解析、切片或写入索引。 */
  | 'processing'
  /** 文档已经完成索引，可被检索命中。 */
  | 'indexed'
  /** 文档已退出检索，等待后台清理。 */
  | 'inactive'
  /** 文档处理失败，通常需要在后台查看错误原因后重试。 */
  | 'failed'

export type KnowledgeDocumentSourceType =
  /** 文档来源是上传文件。 */
  | 'file'
  /** 文档来源是外部 URL。 */
  | 'url'

export interface StructureAwareChunkConfig {
  /** 结构化切片的目标字符数，正常情况下尽量靠近该大小。 */
  targetChars: number
  /** 单个 chunk 的最大字符数，超过后需要继续拆分。 */
  maxChars: number
  /** 单个 chunk 的最小字符数，用于避免过碎切片。 */
  minChars: number
  /** 相邻 chunk 的重叠字符数，用于减少跨块信息丢失。 */
  overlapChars: number
}

export const DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG: StructureAwareChunkConfig = {
  targetChars: 1400,
  maxChars: 1800,
  minChars: 600,
  overlapChars: 0
}

export type KnowledgeQaDeltaEvent =
  | {
      /** 推理过程增量，用于 workspace 思考面板流式展示。 */
      type: 'thinking_delta'
      /** 本次追加的推理文本片段。 */
      delta: string
    }
  | {
      /** 最终回答增量，用于 assistant 回复流式展示。 */
      type: 'answer_delta'
      /** 本次追加的回答文本片段。 */
      delta: string
    }

export interface KnowledgeBaseRetrievalRuntimeConfig {
  /** Admin 命中测试默认返回的 chunk 数。 */
  previewTopK: number
  /** Workspace 问答默认注入的 chunk 数。 */
  workspaceTopK: number
  /** 基于 topK 放大的候选集倍数。 */
  candidateMultiplier: number
  /** 候选集下限，避免 topK 很小时候选过少。 */
  minCandidateLimit: number
  /** 候选集上限，避免单次召回拉取过多 chunk。 */
  maxCandidateLimit: number
  /** BM25 融合权重，本地策略会在该基础上做固定映射。 */
  bm25Weight: number
  /** 向量融合权重，本地策略会在该基础上做固定映射。 */
  vectorWeight: number
  /** 是否启用 LLM query analysis。 */
  queryAnalysisEnabled: boolean
  /** LLM query analysis 的温度，越低越稳定。 */
  queryAnalysisTemperature: number
  /** 用户可配置的白话/术语映射，用于在召回前补充检索词。 */
  queryMappings: KnowledgeQueryMapping[]
}

export interface KnowledgeQueryMapping {
  /** 触发词或短语，命中用户问题时生效。 */
  trigger: string
  /** 追加到 BM25/evidence terms 的召回词。 */
  terms: string[]
}

export interface KnowledgeBaseAnswerRuntimeConfig {
  /** 回答模型温度，控制最终答案生成的发散程度。 */
  temperature: number
}

export interface KnowledgeBaseRuntimeConfig {
  /** 召回阶段运行配置。 */
  retrieval: KnowledgeBaseRetrievalRuntimeConfig
  /** 回答生成阶段运行配置。 */
  answer: KnowledgeBaseAnswerRuntimeConfig
}

export interface KnowledgeBaseRetrievalRuntimeConfigPatch
  extends Partial<KnowledgeBaseRetrievalRuntimeConfig> {}

export interface KnowledgeBaseAnswerRuntimeConfigPatch
  extends Partial<KnowledgeBaseAnswerRuntimeConfig> {}

export interface KnowledgeBaseRuntimeConfigPatch {
  /** 局部更新召回配置；未传字段保持原值。 */
  retrieval?: KnowledgeBaseRetrievalRuntimeConfigPatch
  /** 局部更新回答配置；未传字段保持原值。 */
  answer?: KnowledgeBaseAnswerRuntimeConfigPatch
}

export interface KnowledgeGlobalRuntimeSettings {
  /** 全库搜索默认使用的运行配置。 */
  runtimeConfig: KnowledgeBaseRuntimeConfig
  /** 全局配置首次创建时间。 */
  createdAt: string | null
  /** 全局配置最近更新时间。 */
  updatedAt: string | null
}

/** 仅保存可公开的供应商运行覆盖项；密钥始终只从本地环境读取。 */
export interface KnowledgeProviderRuntimeConfig {
  llm: {
    baseUrl: string | null
    model: string | null
  }
  ocr: {
    enabled: boolean
    baseUrl: string | null
    model: string | null
  }
  documents: {
    autoSync: boolean
    syncIntervalHours: number
  }
}

export interface KnowledgeProviderRuntimeConfigPatch {
  llmBaseUrl?: string | null
  llmModel?: string | null
  ocrEnabled?: boolean
  ocrBaseUrl?: string | null
  ocrModel?: string | null
  autoSyncDocuments?: boolean
  documentSyncIntervalHours?: number
}

export interface KnowledgeProviderSettings {
  runtimeConfig: KnowledgeProviderRuntimeConfig
  llmApiKeyConfigured: boolean
  ocrApiKeyConfigured: boolean
  llmSource: 'env' | 'saved' | 'none'
  ocrSource: 'env' | 'saved' | 'local'
}

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
    queryAnalysisTemperature: 0.1,
    queryMappings: []
  },
  answer: {
    temperature: 0
  }
}

export const KNOWLEDGE_RUNTIME_CONFIG_LIMITS = {
  previewTopK: { min: 1, max: 50 },
  workspaceTopK: { min: 1, max: 12 },
  candidateMultiplier: { min: 1, max: 12 },
  minCandidateLimit: { min: 1, max: 200 },
  maxCandidateLimit: { min: 1, max: 400 },
  bm25Weight: { min: 0.2, max: 3 },
  vectorWeight: { min: 0.2, max: 3 },
  queryAnalysisTemperature: { min: 0, max: 2 },
  queryMappings: { maxItems: 50, maxTriggerLength: 80, maxTermLength: 80, maxTermsPerMapping: 8 },
  answerTemperature: { min: 0, max: 2 }
} as const

export interface CreateKnowledgeBaseInput {
  /** 知识库名称。 */
  name: string
  /** 知识库说明，可为空。 */
  description?: string
}

export interface UpdateKnowledgeBaseInput {
  /** 新的知识库名称，未传则不修改。 */
  name?: string
  /** 新的知识库说明，未传则不修改。 */
  description?: string
  /** 单库运行配置补丁，只在指定库检索时生效。 */
  runtimeConfig?: KnowledgeBaseRuntimeConfigPatch
}

export interface CreateKnowledgeDocumentInput {
  /** 文档名称。 */
  name: string
  /** 服务端存储路径或上传后生成的文件定位信息。 */
  storagePath: string
  /** 文档级切片配置，未传则使用默认配置。 */
  chunkConfig?: StructureAwareChunkConfig
}

export interface KnowledgeBase {
  /** 知识库 ID。 */
  id: string
  /** 知识库名称。 */
  name: string
  /** 知识库说明。 */
  description: string
  /** 知识库状态。 */
  status: KnowledgeBaseStatus
  /** 当前知识库下的文档数量。 */
  documentCount: number
  /** 当前知识库的单库运行配置。 */
  runtimeConfig: KnowledgeBaseRuntimeConfig
  /** 创建时间。 */
  createdAt: string
  /** 最近更新时间。 */
  updatedAt: string
}

export interface KnowledgeDocument {
  /** 文档 ID。 */
  id: string
  /** 所属知识库 ID。 */
  knowledgeBaseId: string
  /** 文档名称。 */
  name: string
  /** 文档来源类型。 */
  sourceType: KnowledgeDocumentSourceType
  /** 文档存储路径；URL 文档或失败状态下可能为空。 */
  storagePath: string | null
  /** 文档文件类型。 */
  fileType: string | null
  /** 文档文件大小，单位为字节。 */
  fileSizeBytes: number | null
  /** 文档处理状态。 */
  status: KnowledgeDocumentStatus
  /** 文档实际使用的切片配置。 */
  chunkConfig: StructureAwareChunkConfig | null
  /** 文档生成的 chunk 数量。 */
  chunkCount: number
  /** 文档内容预览。 */
  contentPreview: string | null
  /** 成功解析后的正文哈希。 */
  contentHash: string | null
  /** 上次成功索引时的原文件字节哈希。 */
  sourceHash: string | null
  /** 最近一次检测到的、尚未完成索引的原文件哈希。 */
  detectedSourceHash: string | null
  /** 原文件与已索引版本不一致的检测时间。 */
  sourceChangedAt: string | null
  /** 最近一次由自动同步提交重建的时间。 */
  lastAutoSyncAt: string | null
  /** 文档退出检索的时间。 */
  deletedAt: string | null
  /** 回收站到期清理时间。 */
  purgeAfter: string | null
  /** 当前参与检索的文档版本。 */
  activeRevisionId: string | null
  /** 创建时间。 */
  createdAt: string
  /** 最近更新时间。 */
  updatedAt: string
}

export interface KnowledgeChunkBlock {
  /** 原始内容块类型，例如标题、段落、表格等。 */
  blockType: string
  /** 原始内容块文本。 */
  content: string
  /** 当前块标题。 */
  title?: string
  /** 页码，主要用于 PDF 等分页文档。 */
  pageNumber?: number
  /** 标题层级或结构层级。 */
  level?: number
  /** 当前块所在的章节路径。 */
  sectionPath: string[]
  /** 当前块在原始文本中的起始偏移。 */
  startOffset?: number
  /** 当前块在原始文本中的结束偏移。 */
  endOffset?: number
  /** 原始解析器保留的附加元数据。 */
  metadata?: Record<string, unknown> | null
}

export interface KnowledgeChunkMetadata {
  /** 所属知识库 ID。 */
  knowledgeBaseId: string
  /** 所属文档 ID。 */
  documentId: string
  /** 所属文档名称。 */
  documentName: string
  /** 文档文件类型。 */
  fileType?: string
  /** 内容来源类型或解析来源。 */
  sourceKind?: string
  parser?: {
    engine: 'native' | 'mineru'
    reasons: string[]
  }
  /** chunk 内包含的 block 类型集合。 */
  blockTypes?: string[]
  /** chunk 覆盖的页码集合。 */
  pageNumbers?: number[]
  /** chunk 内每个 block 的章节路径集合。 */
  sectionPaths?: string[][]
  /** chunk 内出现的标题集合。 */
  titles?: string[]
  /** chunk 内出现的层级集合。 */
  levels?: number[]
  /** chunk 内 block 的起始偏移集合。 */
  startOffsets?: number[]
  /** chunk 内 block 的结束偏移集合。 */
  endOffsets?: number[]
  /** chunk 内 block 的附加元数据集合。 */
  blockMetadatas?: Array<Record<string, unknown>>
  /** chunk 内部完整 block 列表。 */
  blocks?: KnowledgeChunkBlock[]
}

export interface KnowledgeChunk {
  /** chunk ID。 */
  id: string
  /** 所属文档 ID。 */
  documentId: string
  /** chunk 在文档内的顺序。 */
  sequence: number
  /** chunk 文本内容。 */
  content: string
  /** chunk 字符数。 */
  charCount: number
  /** chunk token 估算数量。 */
  tokenCount: number
  /** Chunk 正文和结构上下文的稳定指纹。 */
  contentHash: string | null
  /** chunk 元数据。 */
  metadata: KnowledgeChunkMetadata | null
  /** 创建时间。 */
  createdAt: string
  /** 最近更新时间。 */
  updatedAt: string
}

export interface KnowledgeDocumentSyncEvent {
  id: string
  documentId: string
  documentName: string
  autoRebuild: boolean
  detectedAt: string
}

export interface KnowledgeDocumentTrash {
  items: KnowledgeDocument[]
  usedBytes: number
  quotaBytes: number
  retentionDays: number
}

export interface KnowledgeDocumentRevision {
  id: string
  documentId: string
  chunkCount: number
  active: boolean
  expiresAt: string | null
  createdAt: string
}

export interface UpdateKnowledgeDocumentInput {
  /** 新的文档名称，未传则不修改。 */
  name?: string
  /** 新的切片配置，通常需要后续重建索引才完整生效。 */
  chunkConfig?: StructureAwareChunkConfig
}

export interface KnowledgeSearchInput {
  /** 用户输入的检索 query。 */
  query: string
  /** 指定知识库 ID；不传表示全库搜索。 */
  knowledgeBaseId?: string
  /** 是否启用 LLM query analysis。 */
  rewrite?: boolean
}

export type KnowledgeRetrievalSource =
  /** 命中来自 BM25 关键词召回。 */
  | 'bm25'
  /** 命中来自向量语义召回。 */
  | 'vector'

export interface KnowledgeSearchDebugInfo {
  /** 用户输入的原始 query。 */
  originalQuery: string
  /** 会话短期记忆识别出的意图，仅用于追踪本轮指代消解。 */
  memoryIntent?: string | null
  /** 短期记忆是否改写了检索问题或本地处理了闲聊。 */
  memoryApplied?: boolean
  /** 短期记忆最终交给检索层的独立问题。 */
  memoryGroundedQuery?: string | null
  /** 会话短期记忆板摘要，用于解释当前讨论范围和目标。 */
  memoryBoardSummary?: string | null
  /** 记忆板来源：本地摘要、LLM 消解，或未生成。 */
  memoryBoardSource?: string | null
  /** 记忆板抽取后追加给召回层的提示词。 */
  memoryRetrievalHints?: string[]
  /** 实际进入召回扩展的记忆提示词。 */
  appliedMemoryRetrievalHints?: string[]
  /** 因本轮显式对象优先而丢弃的记忆提示词。 */
  droppedMemoryRetrievalHints?: string[]
  /** 本轮显式对象与会话记忆对象是否发生冲突。 */
  memoryHintConflict?: boolean
  /** 本轮短期记忆条目的命中与丢弃明细，用于排查上下文污染。 */
  memoryMatchDebug?: {
    selected: Array<{
      documentName: string
      identifiers: string[]
      sectionPath?: string | null
      firstSeen?: number
      lastSeen?: number
      mentionOrder?: number
      matchedTerms: string[]
      score: number
      reason: string
    }>
    dropped: Array<{
      documentName: string
      identifiers: string[]
      firstSeen?: number
      lastSeen?: number
      mentionOrder?: number
      reason: string
    }>
  }
  /** 短期记忆解析耗时。 */
  memoryClarificationCandidates?: Array<{
    documentName: string
    identifiers: string[]
    sectionPath?: string | null
    firstSeen?: number
    lastSeen?: number
    mentionOrder?: number
  }>
  memoryLatencyMs?: number
  /** 本轮关键阶段耗时，用于定位 P95 长尾。 */
  stageTimingsMs?: {
    memory?: number
    queryAnalysis?: number
    retrieval?: number
    ce?: number
    qa?: number
    repair?: number
  }
  /** 归一化后的 query。 */
  normalizedQuery: string
  /** 实际传给 BM25 的 query。 */
  bm25Query: string
  /** 实际传给向量召回的 query。 */
  vectorQuery: string
  /** 是否执行过 LLM query analysis。 */
  rewriteApplied: boolean
  /** 本次最终使用的召回模式。 */
  retrievalMode: string
  /** 本次最终使用的 BM25 权重。 */
  bm25Weight: number
  /** 本次最终使用的向量权重。 */
  vectorWeight: number
  /** BM25 召回候选数量。 */
  bm25HitCount: number
  /** 向量召回候选数量。 */
  vectorHitCount: number
  /** 本次 BM25、向量与内存融合共同使用的候选上限。 */
  candidateLimit?: number
  /** 实际送入 Cross-Encoder 的候选数量。 */
  ceCandidateCount?: number
  /** 是否在弱证据 fallback 阶段触发多 query 二级 RRF。 */
  secondLevelRrfApplied?: boolean
  /** 二级 RRF 使用的独立 query 域。 */
  secondLevelRrfQueries?: string[]
  /** 本次命中的用户可配置 query mapping 触发词。 */
  appliedQueryMappings?: string[]
  /** query mapping 追加给召回层的扩展词。 */
  queryMappingTerms?: string[]
  /** CE 精排前候选文档顺序，用于离线计算 candidate recall。 */
  candidateDocumentNames?: string[]
  /** 路由类型，通常与 retrievalMode 一致。 */
  routeType?: string
  /** 路由来源，例如 rule、llm、policy、fallback。 */
  routeSource?: string
  /** 路由置信度。 */
  routeConfidence?: string
  /** 是否触发过 fallback 二次召回。 */
  fallbackApplied?: boolean
  /** fallback 触发原因。 */
  fallbackReason?: string | null
  /** 精确实体是否未在主检索 top hits 中覆盖。 */
  exactEntityMiss?: boolean
  /** 本次检索保护的精确词。 */
  protectedTerms?: string[]
  /** 本次检索排序阶段使用的排除降权词。 */
  excludedTerms?: string[]
  /** LLM 判断的 query 意图。 */
  llmIntent?: string | null
  /** 证据规划复杂度，用于判断本次是否走多事实/参考文档预算。 */
  evidenceComplexity?: string
  /** 本次证据规划需要覆盖的关键证据词。 */
  evidenceTerms?: string[]
  /** 本次证据规划需要覆盖的字段槽位。 */
  evidenceFieldSlots?: string[]
  /** 本次证据规划需要覆盖的数字、阈值、时间等事实槽位。 */
  evidenceNumericTerms?: string[]
  /** 本次最终采用的动态上下文 chunk 数。 */
  effectiveTopK?: number
  /** 生成前计算得到的证据覆盖率。 */
  evidenceCoverage?: number
  /** 是否触发同文档证据补全。 */
  evidenceExpansionApplied?: boolean
  /** 生成门禁判断结果。 */
  evidenceGateStatus?: 'pass' | 'degraded' | 'blocked'
}

export interface KnowledgeSearchScoreDetail {
  /** 该 chunk 由哪些召回通道命中。 */
  matchedBy: KnowledgeRetrievalSource[]
  /** BM25 原始分数；未由 BM25 命中时为空。 */
  bm25Score: number | null
  /** 向量相似度分数；未由向量命中时为空。 */
  vectorScore: number | null
  /** BM25 与向量融合后的内部排序分。 */
  fusedScore: number
  /** Cross-Encoder 相关性分数；未触发或失败降级时为空。 */
  ceScore?: number
  /** 本地证据感知重排分，用于解释为什么该 chunk 被前置。 */
  evidenceScore?: number
  /** 当前 chunk 覆盖的证据词。 */
  matchedEvidenceTerms?: string[]
  /** 当前 chunk 覆盖的数字事实槽位。 */
  matchedNumericTerms?: string[]
  /** 推断出的文档角色，供 debug 和前端展示。 */
  documentRole?: string
}

export interface KnowledgeSearchHit {
  /** 命中的 chunk ID。 */
  chunkId: string
  /** 命中的文档 ID。 */
  documentId: string
  /** 命中的文档名称。 */
  documentName: string
  /** 命中的 chunk 内容。 */
  content: string
  /** 对外展示的最终分数。 */
  score: number
  /** 召回分数细节。 */
  scoreDetail?: KnowledgeSearchScoreDetail
  /** chunk 在文档内的顺序，用于同文档证据补全和 debug。 */
  sequence?: number | null
  /** chunk 所在章节路径，用于证据补全和可解释展示。 */
  sectionPath?: string | null
  /** chunk 的主标题或最近标题。 */
  primaryTitle?: string | null
}

export interface KnowledgeSearchResponse {
  /** 最终返回的命中 chunk 列表。 */
  hits: KnowledgeSearchHit[]
  /** 本次检索调试信息；关闭调试或异常时可为空。 */
  debug: KnowledgeSearchDebugInfo | null
}

export type KnowledgeReasoningStepKey =
  /** 同一会话内的短期记忆指代消解阶段。 */
  | 'memory_resolution'
  /** 知识库召回阶段。 */
  | 'knowledge_recall'
  /** LLM 推理阶段。 */
  | 'llm_reasoning'
  /** 答案合成阶段。 */
  | 'answer_synthesis'
  /** 深度搜索阶段。 */
  | 'deepsearch'
  /** Web 搜索阶段。 */
  | 'web_search'

export interface KnowledgeReasoningStep {
  /** 推理阶段标识。 */
  stageKey: KnowledgeReasoningStepKey
  /** 阶段标题。 */
  title: string
  /** 阶段副标题，可用于展示命中数量或耗时。 */
  subtitle?: string
  /** 阶段内容文本。 */
  content: string
}
