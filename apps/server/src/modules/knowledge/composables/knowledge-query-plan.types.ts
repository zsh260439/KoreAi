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
  /** 结果应避免包含该值，召回后只做降权，不做硬过滤。 */
  | 'must_exclude'

export type KnowledgeRetrievalMode =
  /** 精确查找模式，优先保护编号、代码、引号词等字面匹配。 */
  | 'exact_lookup'
  /** 关键词增强模式，偏向 BM25 但保留向量召回兜底。 */
  | 'keyword_heavy'
  /** 流程增强模式，适合步骤、排查、处理方法类问题。 */
  | 'procedure_heavy'
  /** 均衡模式，BM25 与向量按运行配置平衡融合。 */
  | 'balanced'
  /** 语义增强模式，适合概念、解释、开放式相似语义查询。 */
  | 'semantic_heavy'

export type KnowledgeQueryRouteSource =
  /** 由本地确定性规则产生的路由来源。 */
  | 'rule'
  /** 由 LLM 分析信号辅助产生的路由来源。 */
  | 'llm'
  /** 由本地默认策略产生的路由来源。 */
  | 'policy'
  /** 主检索质量不足时使用的兜底来源。 */
  | 'fallback'

export type KnowledgeQueryRouteConfidence =
  /** 高置信，通常来自明确编号、错误码、引号词等确定性信号。 */
  | 'high'
  /** 中置信，通常来自流程问法、短 query 或 LLM 分析信号。 */
  | 'medium'
  /** 低置信，通常表示只能走默认均衡策略。 */
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

// 规则层先产出结构化信号，避免一上来就把召回决策交给 LLM。
export type KnowledgeQueryRuleSignal = {
  /** 规则层建议的召回模式。 */
  route: KnowledgeRetrievalMode
  /** 规则层建议的置信度。 */
  confidence: KnowledgeQueryRouteConfidence
  /** 固定为 rule，表示该信号来自本地规则。 */
  source: 'rule'
  /** 命中规则的原因列表，用于 debug 展示和问题排查。 */
  reasons: string[]
  /** 从 query 中提取出的精确保护词，例如编号、错误码、引号词。 */
  exactTerms: string[]
  /** 是否是短 query，短 query 通常更依赖关键词召回。 */
  shortQuery: boolean
  /** 是否像流程、排查、步骤类问法。 */
  procedureLike: boolean
}

// 最终路由决策仍然是本地代码给出的，不直接信任 LLM 输出。
export type KnowledgeQueryRouteDecision = {
  /** 最终采用的召回模式。 */
  mode: KnowledgeRetrievalMode
  /** 最终路由来源，说明是规则、LLM 辅助、本地策略还是兜底。 */
  source: KnowledgeQueryRouteSource
  /** 最终路由置信度。 */
  confidence: KnowledgeQueryRouteConfidence
  /** 最终路由原因，便于 debug 面板说明为什么走这个模式。 */
  reason: string
}

// 检索策略不仅包含权重，也包含候选集规模，便于 exact / fallback 使用不同策略。
export type KnowledgeQueryRetrievalHints = {
  /** 当前检索执行使用的召回模式。 */
  mode: KnowledgeRetrievalMode
  /** 当前检索执行的策略来源。 */
  source: KnowledgeQueryRouteSource
  /** 当前检索执行的策略置信度。 */
  confidence: KnowledgeQueryRouteConfidence
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
  /** 是否需要精确匹配，true 时本地策略可选择 exact_lookup。 */
  needsExactMatch: boolean
  /** 是否需要流程/步骤类回答，true 时本地策略可选择 procedure_heavy。 */
  needsProcedure: boolean
  /** 面向 BM25 的关键词短语扩展。 */
  searchPhrases: string[]
  /** 面向向量召回的语义改写 query。 */
  semanticQueries: string[]
  /** 必须保留的词，会进入 protectedTerms 和 BM25 query。 */
  requiredTerms: string[]
  /** 可选增强词，只扩展召回，不作为必须命中条件。 */
  optionalTerms: string[]
  /** 应避免的词，后续只做排序降权，不做硬过滤。 */
  excludedTerms: string[]
  /** LLM 抽取出的实体列表，用于补充 protectedTerms 和 debug。 */
  entities: KnowledgeQueryEntity[]
  /** LLM 抽取出的结构化约束，后续映射为保护词、扩展词或降权词。 */
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
  /** 本地最终路由决策。 */
  routeDecision: KnowledgeQueryRouteDecision
  /** 透传 LLM 抽取实体，便于 debug 和后续扩展。 */
  entities: KnowledgeQueryEntity[]
  /** 透传 LLM 抽取约束，便于 debug 和后续扩展。 */
  constraints: KnowledgeQueryConstraint[]
  /** 需要优先保护的精确词，用于 fallback 判断和确定性重排。 */
  protectedTerms: string[]
  /** 主检索执行策略。 */
  retrieval: KnowledgeQueryRetrievalHints
  /** 备用均衡检索策略；主策略为 balanced 时为空。 */
  fallbackRetrieval: KnowledgeQueryRetrievalHints | null
}
