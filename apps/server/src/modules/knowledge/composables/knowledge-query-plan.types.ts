// 声明查询意图分类，当前仍保留给 query analysis 使用，但不再参与融合权重计算
export type KnowledgeQueryIntent =
  | 'precise'
  | 'constrained'
  | 'exploratory'
  | 'hybrid'

// 声明 query 中提取出的实体类型，用于把编号、术语、日期等结构化下来
export type KnowledgeQueryEntityKind =
  | 'identifier'
  | 'number'
  | 'date'
  | 'term'
  | 'unknown'

// 声明约束类型，给 query analysis 表达“必须命中 / 应该命中 / 必须排除”
export type KnowledgeQueryConstraintOperator =
  | 'must_equal'
  | 'must_contain'
  | 'should_contain'
  | 'must_exclude'

// 声明分析层推测的检索模式，目前只作为调试输出，不再驱动动态权重
export type KnowledgeRetrievalMode =
  | 'balanced'
  | 'keyword_first'
  | 'semantic_first'

// 声明 query 中单个实体的结构化结果
export type KnowledgeQueryEntity = {
  kind: KnowledgeQueryEntityKind
  surface: string
  canonicalForm: string
}

// 声明 query 中单个约束的结构化结果
export type KnowledgeQueryConstraint = {
  operator: KnowledgeQueryConstraintOperator
  value: string
}

// 声明检索提示结构；当前保留 mode 作为调试信息，权重在服务层固定为 1:1
export type KnowledgeQueryRetrievalHints = {
  mode: KnowledgeRetrievalMode
  bm25Weight: number
  vectorWeight: number
}

// 声明送入 LLM rewrite / analysis 的输入
export type KnowledgeQueryAnalysisInput = {
  originalQuery: string
  normalizedQuery: string
}

// 声明 query analysis 的完整输出
export type KnowledgeQueryAnalysis = {
  intent: KnowledgeQueryIntent
  intentReason: string
  searchPhrases: string[]
  semanticQueries: string[]
  requiredTerms: string[]
  optionalTerms: string[]
  excludedTerms: string[]
  entities: KnowledgeQueryEntity[]
  constraints: KnowledgeQueryConstraint[]
  retrieval: KnowledgeQueryRetrievalHints
}

// 声明最终检索计划：既包含 rewrite 后的查询文本，也包含调试和后续召回要用的结构化信息
export type KnowledgeQueryPlan = {
  originalQuery: string
  normalizedQuery: string
  bm25Query: string
  vectorQuery: string
  rewriteApplied: boolean
  analysis: KnowledgeQueryAnalysis | null
  entities: KnowledgeQueryEntity[]
  constraints: KnowledgeQueryConstraint[]
  retrieval: KnowledgeQueryRetrievalHints
}
