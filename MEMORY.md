# MEMORY

## Project
- Name: `mustfollow-prompt`
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

## Validation Habits
- For backend changes, prefer at least `pnpm --filter server build`.
- For frontend changes, prefer at least `pnpm --filter client build`.
