# BM25 Migration Tech Spec

## 方案结论
- 使用 `apps/server/src/database/data-source.ts` 作为 TypeORM migration 的唯一入口。
- 旧的 `apps/server/sql/knowledge-bm25/*.sql` 已经全部收敛到 4 个正式 migration，不再作为运行时依赖保留。
- 应用运行时关闭 `synchronize`，数据库结构变更统一通过 migration 管理。

## 设计取舍
- 不在应用启动时隐式创建 BM25 基础设施。
  - 原因：扩展安装、索引创建和历史数据迁移属于数据库基础设施，不应该绑在业务服务启动阶段。
  - 影响：环境初始化需要先执行 `pnpm infra:up` 或 `pnpm db:bootstrap`，但职责清晰，失败也更可定位。
- bootstrap 只负责两类事情：空库建基础表，非空完整库跑 migration。
  - 原因：TypeORM `synchronize` 适合 0 到 1 建表，不适合接管已经存在的生产式结构变更。
  - 影响：旧数据导入后不会被二次猜测结构，减少误改风险。
- migration 保持幂等。
  - 原因：本地环境、旧库和 Docker 库的状态可能不一致，幂等是切换成本最低的做法。
  - 影响：重复执行初始化命令时，只会补齐缺失步骤，不会要求手工判断当前阶段。

## 实现范围
- `apps/server/src/database/migrations/*.ts`
- `apps/server/src/database/data-source.ts`
- `apps/server/src/database/bootstrap.ts`
- `apps/server/src/app.module.ts`
- 根目录 `package.json`
- `apps/server/package.json`

## 执行流程
1. `pnpm infra:up`
2. `pnpm dev:server`

## 验证步骤
- 构建检查：`pnpm --filter server build`
- migration 状态：`pnpm db:migration:show`
- bootstrap 验证：`pnpm db:bootstrap`
- 启动验证：访问 `http://localhost:3001/api/health`
