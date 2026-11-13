# WriteLater

Capture messy thoughts on the go, then know exactly where to write them in your paper planner later.

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

- Captures are stored on this device in IndexedDB (database `writelater`, schema version 1). Nothing is sent to a server, and WriteLater does not encrypt it.
- Each capture's ID is the operation ID created when the draft starts, so retrying a save never creates a duplicate. "Saved" is shown only after the write commits.
- The unsaved draft is kept in `localStorage` until it is saved or cleared.
- Open `/?demo=1` for sample items. Demo mode uses a separate `writelater-demo` database.
- Review status changes (Place, Done, Can wait) are not persisted yet.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19, Vite 7, Tailwind CSS 4
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Workspace layout

| Path | Purpose |
|------|---------|
| `artifacts/writelater` | WriteLater app (capture, inbox, ritual, planner) |
| `artifacts/mockup-sandbox` | UI prototyping canvas |
| `artifacts/api-server` | Express API |
| `lib/api-spec` | OpenAPI spec + Orval codegen config |
| `lib/api-client-react` | Generated React Query hooks |
| `lib/api-zod` | Generated Zod schemas |
| `lib/db` | Drizzle schema and migrations |
