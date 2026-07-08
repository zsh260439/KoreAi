# BM25 Migration PRD

## 背景
- 当前后端已经接入 `KnowledgeBm25Service` 的启动校验。
- 数据库里是否存在 `pg_search` 扩展、搜索列和 `knowledge_chunks_bm25_idx` 索引，直接决定服务能否启动。
- 现状仍依赖 `synchronize: true` 和手工 SQL，导致环境初始化不可重复、不可审计，也不利于面试表达。

## 目标
- 把 BM25 相关数据库基础设施纳入正式 migration 流程。
- 让开发、测试、本地环境都遵循同一套“先迁移，再启动”的路径。
- 停止继续依赖 `synchronize: true` 作为数据库结构演进方案。

## 非目标
- 不在这次工作里重构 BM25 检索逻辑本身。
- 不在这次工作里处理旧 chunk 全量重建。
- 不在这次工作里补新的管理台或可视化界面。

## 用户价值
- 新环境初始化更稳定，不再靠手工记 SQL 顺序。
- 老环境升级更可控，迁移历史可追踪。
- 面试时可以明确讲清楚“数据库基础设施如何工程化落地”，而不是停留在脚本散落阶段。

## 验收标准
- 项目中存在可执行的 TypeORM migration 文件，完整覆盖：
  - 安装 `pg_search`
  - 新增 BM25 搜索列
  - 回填旧数据搜索列
  - 创建 BM25 索引
- `apps/server` 提供标准 migration 命令。
- NestJS 启动配置不再使用 `synchronize: true`。
- `pnpm --filter server build` 通过。
- migration 命令至少能完成一次本地执行或显示待执行状态。

## 风险
- 旧数据库可能已经手工执行过部分 SQL，migration 必须尽量幂等。
- `pg_search` 扩展依赖本机 PostgreSQL 环境，若扩展缺失会阻塞迁移。
- 数据回填属于数据级操作，回滚不能伪装成完全无损。
