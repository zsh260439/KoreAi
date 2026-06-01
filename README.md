# Mustfollow-prompt

## Backend

项目已补好基础 `NestJS` 框架，位置在 `apps/server`。

当前只包含：

- 标准 `main.ts` 启动入口
- `AppModule / AppController / AppService`
- 模块占位：
  - `auth`
  - `workspace`
  - `admin`
  - `trace`
  - `knowledge`
  - `pipeline`
  - `system`
- 全局配置：
  - `ConfigModule`
  - `ValidationPipe`
  - `CORS`
  - 全局前缀 `/api`

当前没有生成任何业务核心逻辑、DTO、实体、数据库、鉴权、具体接口实现，方便你自己继续深入学习和搭建。

## Run

安装依赖：

```bash
pnpm install
```

启动前端：

```bash
pnpm dev:client
```

启动后端：

```bash
pnpm dev:server
```

构建后端：

```bash
pnpm build:server
```
