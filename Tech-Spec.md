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

## 本轮实现补充：知识库运行配置

### 目标
- 把目前散落在 service 和环境变量里的运行参数收敛到 `knowledge base runtimeConfig`。
- admin 通过独立页面显式查看和修改这份配置。
- retrieval preview 与 workspace chat 共用同一份配置，避免两边行为漂移。

### 数据模型
- 在 `knowledge_bases` 表新增 `runtimeConfig jsonb` 字段。
- `KnowledgeBase` 共享契约增加 `runtimeConfig`。
- 运行配置初步拆成两组：
  - `retrieval`
    - `previewTopK`
    - `workspaceTopK`
    - `candidateMultiplier`
    - `minCandidateLimit`
    - `maxCandidateLimit`
    - `bm25Weight`
    - `vectorWeight`
    - `queryAnalysisEnabled`
    - `queryAnalysisTemperature`
  - `answer`
    - `temperature`

### 运行时接入点
- `knowledgeBaseId` 为空时：
  - `KnowledgeService.searchKnowledge` 与 `WorkspaceService.chatStream` 读取 `knowledge_runtime_settings` 中的全局默认配置
- `knowledgeBaseId` 指向具体知识库时：
  - 继续优先读取该知识库自己的 `runtimeConfig`
- `KnowledgeService.searchKnowledge`
  - 使用当前知识库 `runtimeConfig.retrieval.previewTopK`
- `WorkspaceService.chatStream`
  - 使用当前知识库 `runtimeConfig.retrieval.workspaceTopK`
- `KnowledgeRetrievalService`
  - 使用当前知识库的候选集倍率和上下限
  - 使用当前知识库的手动 BM25 / 向量权重
- `KnowledgeQueryAnalysisService`
  - 使用当前知识库的 `queryAnalysisEnabled`
  - 使用当前知识库的 `queryAnalysisTemperature`
- `KnowledgeQaService`
  - 使用当前知识库的 `answer.temperature`

### Admin 页面
- “全部知识库”模式现在对应一条真实可保存的全局默认配置，而不再只是代码常量展示。
- 全库模式保存到 `PATCH /knowledge/runtime-config/global`。
- 单库模式仍然保存到 `PATCH /knowledge/bases/:kbId`。
- 新增独立路由和侧边导航入口，例如“检索参数”。
- 页面支持：
  - 切换作用域：全局 / 单知识库
  - 在“全局”作用域下编辑全局召回运行参数
  - 选择知识库
  - 按分组编辑 retrieval / answer 参数
  - 保存到 `PATCH /knowledge/bases/:kbId`
  - 恢复默认值

### 取舍
- 这次先做知识库级配置，不做全局系统设置表。
- 这样 workspace 传入 `knowledgeBaseId` 后可以天然命中对应配置，职责最清晰。
- 仍然保留环境变量里的模型和 API Key；本轮只显式化“行为参数”，不把敏感配置搬到后台。

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
