# Enterprise Retrieval Upgrade PRD

## 背景
- 当前知识检索已经具备 `BM25 + Vector + RRF` 的基础混合召回能力，但检索链路仍停留在 Demo 级。
- 用户原始问题会被原样送入 BM25 和向量召回，没有查询归一、术语扩写、候选过滤和多级重排。
- 现有架构可以“查到一些东西”，但无法稳定解释为什么命中、为什么错召回，也无法形成可持续优化闭环。

## 目标
- 将当前检索链路升级为可长期维护的企业版 V1：
  - Query Engine
  - Dual Retrieval
  - Candidate Sanity / Filter
  - Multi-Stage Ranking
  - Retrieval Observability
- 保留现有 BM25 与 pgvector 基础设施，不推翻已完成的数据库和 chunk 方案。
- 输出可解释的召回结果，为后续向量模型、reranker 和评测集优化提供稳定骨架。

## 非目标
- 本次不更换 embedding 模型。
- 本次不上 LLM query expansion 全量生产链路，只预留配置位和调用边界。
- 本次不改前端交互结构，不新增复杂管理台页面。
- 本次不重做 BM25 索引、chunk 表结构和现有知识问答 prompt。

## 用户价值
- 对编号、阈值、专业术语、口语问法的召回更稳。
- 错邻居文档、跨文档族噪声、低分相似片段更少。
- 每次召回都能解释：问题如何被理解、候选如何被过滤、为什么这个 chunk 排在前面。
- 后续可以继续做向量模型升级、模型重排和评测体系，而不必再重构主链路。

## 目标用户
- 管理台 review 检索链路的开发者。
- 使用 workspace 问答能力的最终用户。
- 面试场景中需要讲清楚企业级 RAG 架构的项目维护者。

## 验收标准
- 检索前存在独立 Query Engine，对原始 query 进行：
  - 编号归一
  - 数字/比例归一
  - 术语扩展
  - 意图识别
- 双路召回参数解耦：
  - BM25 candidate limit 与 vector candidate limit 可独立配置
  - 不同 intent 使用不同召回 profile
- 候选进入融合前，存在明确过滤层：
  - 向量相似度阈值
  - 编号/文档族一致性校验
  - 去重与噪声压制
- 最终排序不再只靠裸 RRF，而是：
  - RRF 粗融合
  - 规则特征重排
  - 统计特征精排
- 返回结果包含可解释 score detail，至少能看出：
  - 来自哪些分支
  - 原始 BM25 / Vector 分值
  - 最终重排分
  - 命中特征
- 检索服务有结构化日志，能够记录：
  - 原始 query
  - normalized / expanded query
  - intent
  - 候选数量变化
  - 最终 topK 摘要
- `pnpm --filter server build` 通过。
- 真实样本查询能够跑通，且不破坏当前知识问答主流程。

## 风险
- 规则扩展如果写得过重，可能带来 query 污染，反而伤害精准检索。
- 编号/文档族过滤过严，可能误伤需要跨文档族的多跳问题。
- 过多 explainability 字段会让 scoreDetail 变得臃肿，需要控制在可读范围内。
- 如果没有统一配置入口，后续会再次滑回“把规则散落在各个 service”。
