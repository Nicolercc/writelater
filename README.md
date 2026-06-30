# WriteLater

Capture ideas, process your inbox, and plan with intention.

## Run & Operate

- `pnpm --filter @workspace/writelater run dev` — run the WriteLater frontend (requires `PORT` and `BASE_PATH`)
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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
