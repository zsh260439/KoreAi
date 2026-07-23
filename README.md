# KoreAI RAG 问答系统

面向个人知识管理场景的多模态 RAG 问答系统。项目支持 PDF、DOCX、Markdown、TXT 文档接入，结合 MinerU、OCR/VLM、结构化切分、混合检索、证据门禁、短期记忆和链路追踪，形成从文档入库到多轮问答复盘的完整闭环。

## 技术栈

- Frontend: Vue 3, TypeScript, Vite, Pinia, Element Plus, Shiki, Vue Office
- Backend: NestJS, TypeORM, BullMQ, LangChain
- Database: PostgreSQL / ParadeDB, pgvector / HNSW, BM25
- Parsing: MinerU, native PDF parse, DOCX OOXML parse, OCR/VLM
- Evaluation: RAGAS, Recall@K, MRR, Hit@K, production trace replay

## 项目结构

```text
apps/
  client/                 Workspace 与 Admin 前端
  server/                 NestJS API、RAG pipeline、异步任务
  share-type/             前后端共享类型与运行配置契约

apps/server/src/modules/knowledge/
  dto/                    API 入参 DTO
  entity/                 TypeORM 实体
  pipeline/
    document-processing/  文档解析、OCR/MinerU、切分、索引写入、版本重建
    query-understanding/  查询路由、LLM query analysis、rewrite、记忆提示合并
    candidate-retrieval/  BM25、pgvector、RRF、二层 RRF、CE rerank
    evidence-gating/      证据计划、字段 slot 覆盖、事实抽取、门禁状态
    answer-generation/    QA prompt、流式生成、答案修复与 grounding
  runtime/
    config/               全局/单库运行配置、Provider 设置
    management/           知识库管理

apps/server/src/test/
  knowledge/              ingestion/query/retrieval/evidence 回归测试
  workspace/chat/         会话短期记忆回归测试
```

## 核心能力

- 多格式解析：PDF/DOCX/Markdown/TXT 全格式入库，PDF 支持 native/MinerU 自动路由，DOCX 读取 OOXML 正文与嵌入图片。
- 视觉补偿：OCR/VLM 用于扫描页、复杂图文页和 DOCX 图片字段补偿，保留图片中的阈值、代码、时间窗口等机器值。
- 增量索引：文件 SHA256 与 Chunk 复合指纹用于复用未变化向量；Revision 原子切换活跃索引，支持回滚和延时清理。
- 混合召回：BM25 + pgvector 融合，弱证据场景支持多 query 二层 RRF；候选进入 CE rerank 和证据筛选。
- 证据门禁：按字段 slot 判断主控制阈值、责任角色、预警值、处置代码、响应时限等是否有 concrete value 支撑。
- 会话记忆：按会话维护当前主题、确认事实、引用对象和检索 hints；显式新文档屏蔽旧记忆，模糊追问继承最近引用文档。
- 链路追踪：持久化 query analysis、召回得分、证据门禁、引用 chunk、耗时和 token，支持历史复盘。

## 环境准备

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动基础设施

项目默认使用 Docker 启动 Redis 和 ParadeDB：

```bash
pnpm infra:up
```

`compose.yaml` 默认暴露：

- PostgreSQL / ParadeDB: `127.0.0.1:5433`
- Redis: `127.0.0.1:6379`

默认数据库：

```text
postgres://postgres:postgres@127.0.0.1:5433/KoreAi
```

### 3. 配置环境变量

复制示例文件后填入自己的模型服务配置：

```bash
cp apps/server/.env.example apps/server/.env.local
cp apps/client/.env.example apps/client/.env.local
```

不要提交 `.env.local`、API key、token 或私钥。

### 4. 数据库迁移

```bash
pnpm db:migrate
```

如数据库为空，也可以直接使用：

```bash
pnpm db:bootstrap
```

## 本地启动

```bash
pnpm dev:server
pnpm dev:client
```

默认地址：

- Client: [http://localhost:5173](http://localhost:5173)
- Server API: [http://localhost:3001/api](http://localhost:3001/api)

## 必要配置

### Server

详见 [apps/server/.env.example](apps/server/.env.example)。

必须配置：

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `EMBEDDING_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`

按需配置：

- `RERANK_BASE_URL`, `RERANK_API_KEY`, `RERANK_MODEL`
- `OCR_BASE_URL`, `OCR_API_KEY`, `OCR_MODEL`
- `MINERU_BASE_URL` 或 `MINERU_API_KEY`
- `KNOWLEDGE_UPLOAD_DIR`

### Client

详见 [apps/client/.env.example](apps/client/.env.example)。

必须配置：

- `VITE_API_BASE_URL`

## 常用命令

```bash
pnpm build:server
pnpm build:client
pnpm db:migration:show
pnpm db:migrate
pnpm db:migration:revert
```

后端回归测试当前以编译后 JS 运行，例如：

```bash
pnpm --filter server build
node apps/server/dist/test/knowledge/evidence/knowledge-evidence-planner.test.js
node apps/server/dist/test/workspace/chat/workspace-chat-memory.service.test.js
node apps/server/dist/test/knowledge/query/knowledge-query-engine.service.test.js
node apps/server/dist/test/knowledge/retrieval/knowledge-ce-ranker.test.js
node apps/server/dist/test/knowledge/ingestion/knowledge-chunk-builder.test.js
node apps/server/dist/test/knowledge/ingestion/knowledge-document-hash.test.js
```

## 关键接口

Knowledge:

- `GET /api/knowledge/bases`
- `POST /api/knowledge/bases`
- `PATCH /api/knowledge/bases/:kbId`
- `DELETE /api/knowledge/bases/:kbId`
- `POST /api/knowledge/search`
- `GET /api/knowledge/runtime-config/global`
- `PATCH /api/knowledge/runtime-config/global`
- `GET /api/knowledge/provider-settings`
- `PATCH /api/knowledge/provider-settings`

Document:

- `GET /api/knowledge/bases/:kbId/documents`
- `GET /api/knowledge/documents/:docId`
- `GET /api/knowledge/documents/:docId/file`
- `POST /api/knowledge/bases/:kbId/documents/upload`
- `POST /api/knowledge/documents/:docId/chunks/rebuild`
- `GET /api/knowledge/documents/:docId/chunks`
- `GET /api/knowledge/documents/:docId/revisions`
- `POST /api/knowledge/documents/:docId/revisions/:revisionId/rollback`
- `GET /api/knowledge/documents-trash`
- `POST /api/knowledge/documents/:docId/restore`
- `DELETE /api/knowledge/documents/:docId/purge`

Workspace:

- `GET /api/workspace/conversations`
- `POST /api/workspace/conversations`
- `GET /api/workspace/conversations/:conversationId/messages`
- `DELETE /api/workspace/conversations/:conversationId`
- `POST /api/workspace/chat/stream`

## 验证状态

当前核心回归已覆盖：

- 字段 slot 证据计划与门禁
- 会话短期记忆与模糊追问继承
- query plan 对冲突 memory hints 的过滤
- CE rerank 边界
- 结构化 chunking
- chunk hash 与同步间隔

## 已知边界

- OCR/VLM 是否可用取决于本地模型配置和图片质量。
- MinerU 云 API 需要网络环境可访问；自托管 MinerU 需配置 `MINERU_BASE_URL`。
- BM25 依赖数据库侧能力；当前 Docker 使用 ParadeDB，普通 PostgreSQL 环境需要确认扩展与迁移可用。
- RAGAS 指标用于回归对比，不应直接包装成真实线上正确率。
