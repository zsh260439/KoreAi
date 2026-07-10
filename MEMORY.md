# MEMORY

## Project
- Name: `KoreAi`
- Updated: 2026-07-07
- Package manager: `pnpm@10.17.0`
- Main directories: `apps/client`, `apps/server`, `apps/share-type`, `docs`, `scripts`

## Architecture Notes
- This repo uses a workspace split between `client`, `server`, and shared contracts in `share-type`.
- `admin` and `workspace` are separate product structures; avoid continuing old cross-structure leftovers.
- Shared API and domain contracts should prefer `apps/share-type` as the single source of truth.

## User Preferences
- Conversation, planning, review, and summaries should be in Chinese.
- Code identifiers remain English, but code comments and commit messages should be in Chinese.
- Prefer readable, low-redundancy code with clear cohesion and low coupling.
- Avoid over-defensive programming, fake functionality, long inline template logic, and unnecessary type wrappers.
- Keep meaningful declaration-style comments readable; do not introduce garbled text.

## Known Decisions
- Knowledge-base document upload has been upgraded to real browser file upload instead of fake `storagePath` input.
- Knowledge-base list `documentCount` should be counted from the document table, not inferred from ORM relation length.
- Workspace chat auto-scroll keeps one `stickToBottom` user-intent state, updates it from the scroll container, and uses `ResizeObserver` on message content for follow-to-bottom; avoid `MutationObserver`, deep message watchers, and timer-based force-stick behavior for this flow.
- Structure-aware chunking now follows `section-first, length-fallback, deduped serialization`: sibling sections should not be merged into one chunk, overlap should only carry body blocks, and repeated path/title text should not be injected into every block body.
- The current default structure-aware chunk config baseline is `targetChars=700`, `maxChars=900`, `minChars=300`, `overlapChars=80`; existing documents keep their stored `chunkConfig` until rebuilt or updated.
- Chunk `content` now prefers `section title + body` only; document root titles remain in searchable fields such as `documentName`, `primaryTitle`, and `sectionPath`, instead of being duplicated into embedding text.
- Workspace assistant messages now persist a separate `retrievalDebug` snapshot alongside `citations`, so chat-side recall UI and history replay can show the same BM25/vector debug data without duplicating it into each hit.
- Knowledge retrieval and answer runtime parameters are now persisted per knowledge base via `runtimeConfig`, with an admin-level dedicated settings page at `/admin/knowledge-settings`; this page is the explicit source of truth for preview topK, workspace topK, candidate limits, BM25/vector weights, query-analysis temperature, and QA temperature.
- The retired `knowledge_runtime_settings` table should not be used anymore; active retrieval runtime behavior now comes only from per-knowledge-base `runtimeConfig` or the shared in-code default when `knowledgeBaseId` is empty.
- Local PostgreSQL runs as `postgresql-x64-18` on port `5433`.
- `pg_search` is a PostgreSQL extension rather than a NestJS package. On this Windows machine it can be compiled only after local `pgrx` Windows shim patching, and final installation into `D:\postgresql\share\extension` still requires administrator write permission.
- Server-side BM25 database infrastructure now follows TypeORM migrations via `apps/server/src/database/data-source.ts`; run migrations before starting the server, and do not rely on `synchronize` for BM25 schema/index setup.
- On this Windows setup, `pg_search` BM25 index creation currently crashes PostgreSQL with `stuck spinlock detected at SpinLockAcquire__pgrx_cshim`; schema/backfill migrations can be managed, but the final BM25 index is blocked by the extension runtime itself.
- Docker-based database bootstrap now uses `pnpm infra:up` / `pnpm db:bootstrap`: empty databases first create base tables from entities, existing complete databases skip schema sync, and partial databases fail fast instead of guessing.
- The old `apps/server/sql/knowledge-bm25/*.sql` scripts are retired; BM25 database changes now live only in TypeORM migrations and bootstrap flow.
- Legacy local PostgreSQL data has been migrated from `knowledge_app` into the Docker `KoreAi` database; Docker is now the active runtime database for this project.

## Validation Habits
- For backend changes, prefer at least `pnpm --filter server build`.
- For frontend changes, prefer at least `pnpm --filter client build`.
