# WriteLater

Capture a thought on your phone, then move it into your paper planner or digital notes and confirm the handoff.

## Deploying WriteLater

WriteLater is a static Vite app inside a pnpm monorepo. Deploy from the **repository root**, not from `artifacts/writelater` alone.

| Setting | Value |
|---------|--------|
| Project root | Repository root |
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm --filter @workspace/writelater run build` |
| Output directory | `artifacts/writelater/dist/public` |

Do **not** use `pnpm run build` at the repo root for a WriteLater-only deploy — that builds every workspace package.

A `vercel.json` at the repo root is configured with these settings. `BASE_PATH` defaults to `/` at build time; set it only if hosting under a subpath.

## Checks

CI (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main`. It runs, in order:

1. `pnpm install --frozen-lockfile`
2. `pnpm run typecheck`
3. `pnpm --filter @workspace/writelater run test`
4. `pnpm --filter @workspace/writelater run build`

Run the same commands locally before pushing. Use the pinned pnpm (`corepack enable`, or `npx pnpm@10.34.9`). pnpm 11 rewrites the lockfile.

## Run & Operate

- `pnpm --filter @workspace/writelater run dev` — run the WriteLater frontend (`PORT` defaults to 3000, `BASE_PATH` defaults to `/`)
- `pnpm --filter @workspace/writelater run test` — run WriteLater unit and component tests (Vitest, jsdom, fake-indexeddb)
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## WriteLater storage

- Everything is stored on this device in IndexedDB (database `writelater`, schema version 3). Nothing is sent to a server, and WriteLater does not encrypt it.
  - v1: `captures`
  - v2 adds `destinations` and `handoffs`.
  - v3 adds `events`.
  - Migrations are additive.
- Each capture's ID is the operation ID created when the draft starts, so retrying a save never creates a duplicate. "Saved" is shown only after the write commits.
- A capture with no handoff is **Unsorted**. Sorting it creates a handoff that is pending, deferred until a local date, completed (Written or Added), or discarded (Let go).
- Every handoff change checks the record's revision inside one transaction and refuses stale writes from another tab. Undo is refused once the item has changed since.
- Tabs tell each other about writes through `BroadcastChannel`.
- Destinations can be renamed (the ID stays the same) and archived. Archiving moves every waiting item to another destination or back to Unsorted in the same transaction. Done items keep their history, and Restore makes an archived destination active again.
- For digital destinations, **Copy Markdown** copies the capture text only, with no source links. Copying never completes a handoff; you confirm with **Added**. If the clipboard is blocked, the text is shown selected for manual copying.
- Review home offers a JSON backup (every record), a Markdown export (text grouped by destination), and a usage summary.
- The usage log (`events`) records an event type and a time, never writing or names. The usage summary exports counts per local day only.
- The unsaved draft is kept in `localStorage` until it is saved or cleared.
- **Deleting:** any capture can be deleted permanently after a confirmation, together with its handoffs, in one transaction. **Erase everything** (Review → Your data) clears every store and this database's `localStorage` keys. Downloaded files and anything copied elsewhere are outside WriteLater and aren't affected.
- Open `/?demo=1` for sample destinations and items. Demo mode uses a separate `writelater-demo` database.

## Stack

- pnpm 10 workspaces (pinned by `packageManager`), Node.js 22 (`.nvmrc`), TypeScript 5.9
- Frontend: React 19, Vite 7, Tailwind CSS 4
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Workspace layout

| Path | Purpose |
|------|---------|
| `artifacts/writelater` | WriteLater app (capture and review) |
| `artifacts/mockup-sandbox` | UI prototyping canvas |
| `artifacts/api-server` | Express API |
| `lib/api-spec` | OpenAPI spec + Orval codegen config |
| `lib/api-client-react` | Generated React Query hooks |
| `lib/api-zod` | Generated Zod schemas |
| `lib/db` | Drizzle schema and migrations |
