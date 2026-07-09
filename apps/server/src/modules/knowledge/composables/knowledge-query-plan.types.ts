export type KnowledgeQueryIntent =
  | 'precise'      // 精确检索
  | 'constrained'  // 带条件限定检索
  | 'exploratory'  // 探索问答/解释类
  | 'hybrid'       // 混合（既有精确实体又有提问解释）
export type KnowledgeQueryEntityKind =
  | 'identifier' // 业务编号：SKU、工单、订单ID、设备编码
  | 'number'      // 数值：整数、浮点数、百分比
  | 'date'        // 日期：2026-01、上周、三季度
  | 'term'        // 业务术语：毛利率、回款周期、审批流程
  | 'unknown'     // 无法归类的普通词汇
export type KnowledgeQueryConstraintOperator =
  | 'must_equal'    // 必须完全等于（精确匹配编码）
  | 'must_contain'  // 必须包含该词（强制命中）
  | 'should_contain'// 最好包含，不强制（加分项）
  | 'must_exclude'  // 必须排除，命中直接过滤文档
export type KnowledgeRetrievalMode =
  | 'balanced'      // 平衡，关键词、语义各占一半权重
  | 'keyword_first' // 关键词优先，BM25打分权重更高
  | 'semantic_first'// 语义优先，向量相似度权重更高
export type KnowledgeQueryEntity = {
  kind: KnowledgeQueryEntityKind // 实体类型（编号/数字/日期/术语）
  surface: string                // 原文表层文本（用户输入原样）
  canonicalForm: string          // 标准归一化格式
}
export type KnowledgeQueryConstraint = {
  operator: KnowledgeQueryConstraintOperator
  value: string
}
export type KnowledgeQueryRetrievalHints = {
  mode: KnowledgeRetrievalMode
  bm25Weight: number   // BM25关键词打分权重 0~1
  vectorWeight: number // 向量语义相似度权重 0~1
}
export type KnowledgeQueryAnalysisInput = {
  originalQuery: string   // 用户原始输入，未清洗
  normalizedQuery: string // 归一化清洗后文本
}
export type KnowledgeQueryAnalysis = {
  intent: KnowledgeQueryIntent         // 判定的查询意图
  intentReason: string                  // 判定理由，用于日志排查
  searchPhrases: string[]               // 用于BM25关键词检索的短语
  semanticQueries: string[]            // 用于向量嵌入的改写语义问句
  requiredTerms: string[]              // 强制必须出现的核心词
  optionalTerms: string[]              // 可选加分词汇
  excludedTerms: string[]              // 需要过滤排除的词
  entities: KnowledgeQueryEntity[]     // 提取到的全部实体列表
  constraints: KnowledgeQueryConstraint[] // 筛选约束条件
  retrieval: KnowledgeQueryRetrievalHints  // 检索权重策略
}
export type KnowledgeQueryPlan = {
  originalQuery: string
  normalizedQuery: string
  bm25Query: string        // 拼接好的完整BM25检索语句
  vectorQuery: string      // 用于生成向量嵌入的标准问句
  analysis: KnowledgeQueryAnalysis | null // 完整解析信息，兜底兼容无解析场景
  entities: KnowledgeQueryEntity[]        // 顶层实体副本，方便检索层快速读取
  constraints: KnowledgeQueryConstraint[] // 顶层约束副本
  retrieval: KnowledgeQueryRetrievalHints // 检索权重策略
}