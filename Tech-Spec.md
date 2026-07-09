# Enterprise Retrieval Upgrade Tech Spec

## 方案结论
- 现有 `KnowledgeRetrievalService` 升级为完整检索编排层，而不是继续做“原始 query 双路并发 + 裸 RRF 融合”。
- 保留现有 `KnowledgeBm25Service` 与 `KnowledgeVectorStoreService` 作为基础召回层，不推翻底层基础设施。
- 新增 Query Engine、Candidate Enricher、Candidate Filter、Multi-Stage Reranker 和 Retrieval Logging。

## 目标架构
1. `KnowledgeQueryEngineService`
2. `KnowledgeBm25Service`
3. `KnowledgeVectorStoreService`
4. `KnowledgeRetrievalCandidateEnricherService`
5. `KnowledgeRetrievalCandidateFilterService`
6. `KnowledgeRetrievalRerankerService`
7. `KnowledgeRetrievalService`

## 模块职责

### 1. Query Engine
- 输入：用户原始 query
- 输出：`KnowledgeQueryPlan`
- 职责：
  - 归一编号、数字、比例、空格、大小写
  - 提取 codes / domain / subject / numericTokens
  - 基于静态术语词典做扩展
  - 识别 retrieval intent
  - 生成：
    - `bm25Query`
    - `vectorQuery`
    - `candidateProfile`
    - `strictFilters`

### 2. BM25 Retrieval
- 输入：`bm25Query`
- 输出：BM25 branch candidates
- 保持现有 pg_search 基础能力不变，只增加与新候选类型的字段对齐。

### 3. Vector Retrieval
- 输入：`vectorQuery`
- 输出：vector branch candidates
- 保持现有 pgvector 基础能力不变，只增强候选字段和日志可解释性。

### 4. Candidate Enricher
- 输入：双路候选的 chunkId 集合
- 输出：带 searchable fields 的 enriched candidates
- 从 `knowledge_chunks` 表补齐：
  - `knowledgeBaseId`
  - `documentName`
  - `fileType`
  - `sourceKind`
  - `primaryTitle`
  - `sectionPath`
  - `blockTypes`
  - `sequence`
  - `charCount`

### 5. Candidate Filter
- 输入：`KnowledgeQueryPlan + enriched candidates`
- 输出：过滤后的 candidates
- 规则：
  - 向量相似度阈值
  - 编号一致性
  - 文档族一致性
  - 去重与低质量噪声拦截
  - 为被保留候选记录命中特征，为被丢弃候选记录 dropped reasons

### 6. Reranker
- 输入：过滤后的 candidates
- 输出：最终 `KnowledgeSearchHit[]`
- 三段逻辑：
  - Branch merge / weighted RRF
  - Rule feature scoring
  - Statistical feature scoring
- 输出 score detail：
  - `matchedBy`
  - `bm25Score`
  - `vectorScore`
  - `fusedScore`
  - `rerankScore`
  - `matchedFeatures`
  - `retrievalIntent`

### 7. Retrieval Logging
- 在 `KnowledgeRetrievalService` 中记录结构化日志：
  - `originalQuery`
  - `normalizedQuery`
  - `bm25Query`
  - `vectorQuery`
  - `intent`
  - branch candidate count
  - filtered count
  - final topK ids / docs

## 数据契约变更
- 扩展 `KnowledgeSearchScoreDetail`
  - `rerankScore?: number`
  - `matchedFeatures?: string[]`
  - `retrievalIntent?: string`
- 新增内部类型：
  - `KnowledgeQueryPlan`
  - `KnowledgeRetrievalIntent`
  - `KnowledgeRetrievalDomain`
  - `KnowledgeRetrievalProfile`

## 配置策略
- 新增集中配置文件：
  - intent profile
  - term synonym map
  - domain keyword map
  - numeric / code normalize rules
  - vector threshold
  - candidate limit

## 设计取舍
- 不新增数据库表保存同义词词典，先用代码内集中常量，保证部署路径最短、读取最稳。
- 不在本次接入 LLM 扩展链路，但把 query plan 结构留好，后续可以无痛接入。
- 不做全量模型 reranker，先以规则+统计特征稳定落地。
- 不把 explainability 放在独立 API，先直接收敛进 `scoreDetail`。

## 验证步骤
1. `pnpm --filter server build`
2. 真实样本 query 调用 `POST /api/knowledge/search`
3. 验证输出中存在：
   - `scoreDetail.rerankScore`
   - `scoreDetail.matchedFeatures`
   - `scoreDetail.retrievalIntent`
4. 验证 query 包含：
   - 编号变体
   - 专业术语别名
   - 泛语义问法
5. 观察日志确认：
   - Query Engine 生效
   - Candidate Filter 生效
   - 最终 topK 稳定返回
