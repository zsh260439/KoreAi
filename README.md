# Mustfollow-prompt

一个基于 `Vue 3 + NestJS + PostgreSQL + pgvector + LangChain` 的本地知识库/RAG 管理台。

当前已经打通的主线是：

- 知识库管理
- 文档入库
- 文档分块
- 向量写入 `pgvector`
- 知识库内向量检索
- 基于检索结果的大模型问答

## 项目结构

```text
apps/
  client/       Vue 3 管理端
  server/       NestJS 服务端
  share-type/   前后端共享类型
```

## 技术栈

- 前端：`Vue 3`、`TypeScript`、`Element Plus`
- 后端：`NestJS`、`TypeORM`
- 数据库：`PostgreSQL`
- 向量能力：`pgvector`
- RAG 基础组件：`LangChain`
- Embedding：`@langchain/openai` + 兼容 OpenAI 协议的 embedding 接口
- 向量检索：`@langchain/pgvector`

## 当前知识库链路

### 1. 文档入库

当前阶段只支持本地 `txt` / `md` 文件。

前端提交：

- 文档名称
- `storagePath`
- 分块策略
- 分块配置

后端不会直接信任前端正文，而是根据 `storagePath` 读取本地文件内容。

### 2. 文档分块

文档重建分块时，服务端会：

1. 读取本地文件内容
2. 使用 `RecursiveCharacterTextSplitter` 切块
3. 生成每个 chunk 的 embedding
4. 写入 `knowledge_chunks`

当前 chunk 表中包含：

- `content`
- `embedding`
- `metadata`
- `documentId`
- `sequence`

其中 `metadata` 目前主要保存：

- `knowledgeBaseId`
- `documentId`
- `documentName`

这样做的目的，是让向量检索阶段可以直接按知识库过滤，而不是每次再额外联表拼过滤条件。

### 3. 知识库搜索

当前 `POST /api/knowledge/search` 已经统一为知识库内的向量召回。

含义是：

- 搜索范围限定在指定 `knowledgeBaseId`
- 核心搜索对象是 `knowledge_chunks`
- 返回命中的 chunk、所属文档、内容、分数

这条链路主要用于：

- RAG Preview
- 调试召回效果
- 后续问答链复用

### 4. 大模型问答

当前问答主链是：

1. 用户输入问题
2. 在指定知识库内召回 topK chunks
3. 拼接上下文
4. 调用聊天模型生成答案
5. 返回答案和引用来源

服务端接口：

- `POST /api/workspace/chat/stream`

返回内容包含：

- `answer`
- `sources`
- `model`

`sources` 直接复用召回结果，便于前端展示引用来源和跳转命中文档。

## 环境准备

### 1. PostgreSQL

本项目当前使用 PostgreSQL，不是 SQLite。

需要准备：

- 一个可连接的 PostgreSQL 实例
- 已启用 `pgvector`
- 数据库连接串写入 `DATABASE_URL`

示例：

```env
DATABASE_URL=postgres://postgres:your_password@127.0.0.1:5433/knowledge_app
```

### 2. Embedding 配置

```env
EMBEDDING_BASE_URL=https://your-provider/v1/embeddings
EMBEDDING_API_KEY=your_embedding_api_key
EMBEDDING_MODEL=your_embedding_model
```

说明：

- `EmbeddingService` 内部会自动把结尾的 `/embeddings` 规范化掉，再传给 LangChain

### 3. LLM 配置

```env
LLM_BASE_URL=https://your-provider/v1
LLM_API_KEY=your_llm_api_key
LLM_MODEL=your_chat_model
RAGAS_LLM_MODEL=your_judge_model
```

注意：

- `LLM_MODEL` 必须是聊天模型
- 不要把 embedding 模型填到 `LLM_MODEL`

## 本地启动

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动后端

```bash
cd apps/server
pnpm run start:dev
```

说明：

- 当前 `start:dev` 走的是 `ts-node`
- 改完服务端代码后，注意确认进程是否已经重新启动

### 3. 启动前端

```bash
cd apps/client
pnpm run dev
```

默认前端地址通常是：

- [http://localhost:5173](http://localhost:5173)

后端默认前缀：

- [http://localhost:3001/api](http://localhost:3001/api)

## 关键接口

### 知识库

- `GET /api/knowledge/bases`
- `POST /api/knowledge/bases`
- `PATCH /api/knowledge/bases/:kbId`
- `DELETE /api/knowledge/bases/:kbId`

### 文档

- `GET /api/knowledge/bases/:kbId/documents`
- `GET /api/knowledge/documents/:docId`
- `POST /api/knowledge/bases/:kbId/documents`
- `PATCH /api/knowledge/documents/:docId`
- `DELETE /api/knowledge/documents/:docId`

### 分块

- `GET /api/knowledge/documents/:docId/chunks`
- `POST /api/knowledge/documents/:docId/chunks/rebuild`

### 搜索与问答

- `POST /api/knowledge/search`
- `POST /api/workspace/chat/stream`

## 当前实现边界

当前已经具备基本可用的本地知识库 RAG 闭环，但边界也很明确：

- 只支持本地 `txt` / `md`
- 主要是单知识库内检索
- 目前以向量召回为主
- 引用来源已经返回，但还不是完整的生产级 citation 系统
- 还没有做更复杂的召回融合、重排、权限隔离和异步任务编排

## 示例知识文档

`knowledge-samples/` 目录保留了几份 Markdown 文档，用于本地测试知识库创建、文档入库、分块、向量写入和 RAG 召回效果。它们不是业务源码，也不是运行时依赖；如果不需要本地靶场数据，可以不导入。

## 后续可继续扩展

- 引入 rerank，提高召回排序质量
- 引入多路召回，再做融合排序
- 增加文档解析能力，支持 `pdf/docx/pptx`
- 把问答链的引用展示做完整
