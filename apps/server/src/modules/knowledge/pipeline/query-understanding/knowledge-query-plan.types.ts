export type KnowledgeQueryIntent =
  /** 精确查询，通常依赖编号、专有词或明确字段匹配。 */
  | 'precise'
  /** 条件查询，用户带有日期、数字、版本、范围或显式限制。 */
  | 'constrained'
  /** 探索查询，用户更关注概念解释、相似语义或开放式资料。 */
  | 'exploratory'
  /** 混合查询，同时包含精确线索和语义理解诉求。 */
  | 'hybrid'

export type KnowledgeQueryEntityKind =
  /** 结构化标识符，例如错误码、单号、版本号、文档编号。 */
  | 'identifier'
  /** 数字实体，例如天数、次数、阈值、金额等。 */
  | 'number'
  /** 日期或时间实体。 */
  | 'date'
  /** 需要保留字面含义的普通术语。 */
  | 'term'
  /** LLM 无法稳定归类但仍值得保留的实体。 */
  | 'unknown'

export type KnowledgeQueryConstraintOperator =
  /** 结果必须等于该值，适合编号、版本、状态这类强条件。 */
  | 'must_equal'
  /** 结果必须包含该值，适合用户明确要求出现的关键词。 */
  | 'must_contain'
  /** 结果最好包含该值，但不能因为缺失就直接排除。 */
  | 'should_contain'

export type KnowledgeRuleSignalConfidence =
  /** 高置信，通常来自明确编号、错误码、引用词等确定性信号。 */
  | 'high'
  /** 中置信，通常来自流程问法、短 query 或 LLM 分析信号。 */
  | 'medium'
  /** 低置信，通常表示只能使用默认均衡策略。 */
  | 'low'

export type KnowledgeQueryEntity = {
  /** 实体类型，用于区分标识符、数字、日期、术语等。 */
  kind: KnowledgeQueryEntityKind
  /** 用户 query 中出现的原始文本片段。 */
  surface: string
  /** 归一化后的实体文本，后续检索和保护词使用这个值。 */
  canonicalForm: string
}

export type KnowledgeQueryConstraint = {
  /** 约束操作符，决定该约束用于增强、保护还是降权。 */
  operator: KnowledgeQueryConstraintOperator
  /** 约束值，例如必须包含的术语、必须排除的词、版本号等。 */
  value: string
}

// 规则层先产出结构化信号，避免一开始就把召回决策交给 LLM。
export type KnowledgeQueryRuleSignal = {
  /** 规则层建议的召回模式。 */
  suggestedRetrievalMode: RagRetrievalMode
  /** 规则层建议的置信度。 */
  confidence: KnowledgeRuleSignalConfidence
  /** 命中规则的原因列表，用于 debug 展示和问题排查。 */
  reasons: string[]
  /** 从 query 中提取出的精确保护词，例如编号、错误码、引用词。 */
  exactTerms: string[]
  /** 是否是短 query；短 query 通常更依赖关键词召回。 */
  shortQuery: boolean
  /** 是否像流程、排查、步骤类问法。 */
  procedureLike: boolean
}

// 检索策略不仅包含权重，也包含候选集规模，便于 exact / fallback 使用不同策略。
export type KnowledgeQueryRetrievalHints = {
  /** 当前检索执行使用的召回模式。 */
  mode: RagRetrievalMode
  /** BM25 融合权重，由本地策略映射，不由 LLM 直接决定。 */
  bm25Weight: number
  /** 向量融合权重，由本地策略映射，不由 LLM 直接决定。 */
  vectorWeight: number
  /** 基于 topK 放大的候选集倍数，用来控制召回候选规模。 */
  candidateMultiplier: number
  /** 候选集下限，避免 topK 很小时候选过少。 */
  minCandidateLimit: number
  /** 候选集上限，避免一次召回拉取过多 chunk。 */
  maxCandidateLimit: number
}

export type KnowledgeQueryComplexity =
  /** 单事实问题，通常只需要少量证据即可回答。 */
  | 'single_fact'
  /** 多事实问题，需要多个事实槽位同时覆盖。 */
  | 'multi_fact'
  /** 需要规则、标准、说明类支撑文档参与的参考型问题。 */
  | 'reference_required'
  /** 证据缺失风险更高的高约束问题。 */
  | 'high_constraint'

export type RagUserIntent =
  | 'fact_lookup'
  | 'comparison'
  | 'summary'
  | 'procedure'
  | 'open_exploration'
  | 'general'

export type RagScopeMode =
  | 'unscoped'
  | 'explicit_single'
  | 'explicit_multi'
  | 'memory_single'
  | 'memory_multi'
  | 'needs_clarification'

export type RagRetrievalMode =
  | 'exact'
  | 'keyword'
  | 'semantic'
  | 'hybrid'

export type RagAnswerMode =
  | 'rag'
  | 'general'
  | 'mixed'
  | 'clarify'
  | 'refuse'

export type RagGateStatus = 'pass' | 'degraded' | 'blocked'

export type ResolvedRetrievalScopeObject = {
  value: string
  kind: 'identifier' | 'filename'
  source: 'explicit' | 'memory'
}

export type ResolvedRetrievalScope = {
  mode: RagScopeMode
  objects: ResolvedRetrievalScopeObject[]
}

export type RagExecutionProfile = {
  userIntent: RagUserIntent
  scopeMode: RagScopeMode
  retrievalMode: RagRetrievalMode
  answerMode: RagAnswerMode
}

export type KnowledgeQueryEvidencePlan = {
  /** 结构化编号、版本、错误码等必须优先覆盖的精确标识。 */
  identifiers: string[]
  /** query 中出现的数字、阈值、时间、次数等事实槽位。 */
  numericTerms: string[]
  /** 用户实际请求的字段槽位；只有字段标签附近存在具体值时才算覆盖。 */
  fieldSlots: string[]
  /** 用于判断 chunk 是否覆盖关键证据的字段、术语词。 */
  evidenceTerms: string[]
  /** 用于触发 reference / standard / playbook 等支撑文档的通用概念词。 */
  referenceTerms: string[]
  /** query 复杂度，用于动态上下文预算和证据门禁。 */
  complexity: KnowledgeQueryComplexity
  /** 是否需要参考标准、规则类文档一起参与回答。 */
  needsReference: boolean
  /** 当前问题建议返回给生成层的 chunk 数。 */
  targetTopK: number
  /** 当前问题允许的最大上下文 chunk 数。 */
  maxTopK: number
  /** 正常回答前建议达到的证据覆盖率。 */
  requiredCoverage: number
  /** 低于该覆盖率时应拒绝确定性回答。 */
  hardGateCoverage: number
}

export type KnowledgeQueryAnalysisInput = {
  /** 用户输入的原始 query，保留给 LLM 分析和 debug 展示。 */
  originalQuery: string
  /** 归一化后的 query，只做文本清洗，不做语义改写。 */
  normalizedQuery: string
}

export type KnowledgeQueryAnalysis = {
  /** LLM 对 query 意图的分类，只作为本地路由的输入信号。 */
  intent: KnowledgeQueryIntent
  /** LLM 给出的意图说明，用于 debug，不直接参与权重决策。 */
  intentReason: string
  /** LLM 判断是否需要精确匹配；只作为新执行画像的输入信号。 */
  needsExactMatch: boolean
  /** LLM 判断是否需要流程类回答；只作为新执行画像的输入信号。 */
  needsProcedure: boolean
  /** 面向 BM25 的关键词短语扩展。 */
  searchPhrases: string[]
  /** 面向向量召回的语义改写 query。 */
  semanticQueries: string[]
  /** 必须保留的词，会进入 scopeTerms 和 BM25 query。 */
  requiredTerms: string[]
  /** 可选增强词，只扩展召回，不作为必须命中条件。 */
  optionalTerms: string[]
  /** 应避免的词，后续只做排序降权，不做硬过滤。 */
  excludedTerms: string[]
  /** LLM 抽取出的实体列表，用于补充 scopeTerms 和 debug。 */
  entities: KnowledgeQueryEntity[]
  /** LLM 抽取出的正向结构化约束，后续映射为保护词或扩展词。 */
  constraints: KnowledgeQueryConstraint[]
}

export type KnowledgeQueryPlan = {
  /** 用户输入的原始 query。 */
  originalQuery: string
  /** 归一化后的 query。 */
  normalizedQuery: string
  /** 最终传给 BM25 的检索 query。 */
  bm25Query: string
  /** 最终传给向量召回的检索 query。 */
  vectorQuery: string
  /** 是否执行过 LLM query analysis。 */
  rewriteApplied: boolean
  /** LLM query analysis 结果；未启用、失败或高置信规则跳过时为 null。 */
  analysis: KnowledgeQueryAnalysis | null
  /** 本地规则层输出的前置信号。 */
  ruleSignal: KnowledgeQueryRuleSignal
  /** 透传 LLM 抽取实体，便于 debug 和后续扩展。 */
  entities: KnowledgeQueryEntity[]
  /** 透传 LLM 抽取约束，便于 debug 和后续扩展。 */
  constraints: KnowledgeQueryConstraint[]
  /** 需要优先保护的精确词，用于 fallback 判断和确定性重排。 */
  scopeTerms: string[]
  /** 需要在排序阶段降权的排除词。 */
  excludedTerms: string[]
  /** 命中的用户可配置 query mapping 触发词。 */
  appliedQueryMappings: string[]
  /** query mapping 追加到召回层的扩展词。 */
  queryMappingTerms: string[]
  /** 会话短期记忆追加到召回层的提示词。 */
  retrievalHintTerms: string[]
  /** 因本轮显式对象优先而丢弃的会话记忆提示词。 */
  droppedRetrievalHintTerms: string[]
  /** 本轮显式对象与会话记忆对象是否发生冲突。 */
  retrievalHintConflict: boolean
  scope: ResolvedRetrievalScope
  executionProfile: RagExecutionProfile
  /** 证据驱动检索计划，供重排、上下文组装和生成门禁复用。 */
  evidencePlan: KnowledgeQueryEvidencePlan
  /** 主检索执行策略。 */
  retrieval: KnowledgeQueryRetrievalHints
  /** 弱证据时使用的备用混合检索策略；主策略已经是 hybrid 时为空。 */
  fallbackRetrieval: KnowledgeQueryRetrievalHints | null
}
