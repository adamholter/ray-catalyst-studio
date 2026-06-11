# Hosted Deployment

Catalyst Studio now supports a hosted, durable deployment without changing the visible app.

## Target Shape

- GitHub is the source of truth for code.
- A single always-on Node service serves both the API and the built React app.
- Postgres stores run records, prompts, statuses, result histories, model invocation metadata, and cost/audit-adjacent data.
- Cloudflare R2 stores copied image and SVG assets so results do not depend on browser session state, local files, or fal media retention.
- fal.ai keys stay server-side.
- Local development still works in mock/file mode by default.

## Production Start

The root production command is:

```sh
npm start
```

It runs:

```sh
tsx apps/api/src/server.ts
```

After `npm run build`, the API serves `apps/web/dist` for all non-API routes. `npm run dev` still runs the API and Vite frontend separately for local development.

## Required Hosted Environment

Use these variables on Railway or another always-on Node host:

```sh
NODE_ENV=production
CATALYST_PROVIDER_MODE=live
FAL_KEY=...

CATALYST_STORE_DRIVER=postgres
DATABASE_URL=postgresql://...

CATALYST_ASSET_STORAGE_DRIVER=r2
R2_ACCOUNT_ID=...
R2_BUCKET=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Optional:

```sh
CATALYST_LLM_PROVIDER=fal-openrouter
CATALYST_OPENROUTER_MODEL=google/gemini-3.5-flash
CATALYST_OPENROUTER_REASONING=low
R2_PUBLIC_BASE_URL=https://assets.example.com
CATALYST_MAX_STORED_RUNS=250
CATALYST_WEB_DIST_DIR=apps/web/dist
```

If `R2_PUBLIC_BASE_URL` is omitted, Catalyst rewrites persisted asset URLs to same-origin `/api/assets/...` routes and streams the private R2 object through the API.

## Durable Storage Behavior

When R2 is enabled, every saved run attempts to copy eligible image URLs into R2:

- generated images
- edited images
- enhanced/upscaled images
- vectorized SVG outputs
- editable mockup extracted assets
- brand identity image assets

The run record is then saved with the R2-backed URL plus storage metadata:

```json
{
  "storage": {
    "provider": "r2",
    "key": "runs/<run-id>/image-1-generated-abc123.png",
    "sourceUrl": "https://v3.fal.media/...",
    "storedAt": "..."
  }
}
```

If the copy fails, Catalyst preserves the run and records an event saying the durable asset copy failed. Treat that event as a production issue to fix before relying on the result long-term.

## Postgres Schema

The API creates this table automatically on first use:

```sql
create table if not exists catalyst_runs (
  id text primary key,
  task_id text not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  run jsonb not null
);
```

This deliberately keeps the initial migration low-risk: the existing `RunRecord` contract remains the system of record. More normalized tables for costs, users, workspaces, and assets can be added once the hosted app is stable.

## Migrating Existing Local Runs

After setting `DATABASE_URL` and R2 env vars, import a local run file:

```sh
npm run migrate:runs -- apps/api/.data/live/runs.json
```

The importer calls the same `saveRun` path as the app, so R2 asset persistence runs during import when enabled.

Do not delete local run files until you have verified the hosted gallery and asset counts.

## GitHub Collaboration

Use Git for code only.

- Do not commit generated assets, local data, `.env`, API keys, or provider exports.
- Work on short-lived feature branches.
- Pull/rebase before starting work.
- Commit only after the local app is verified.
- Push/sync only after Adam or Ray confirms the app is working.

Generated results belong in Postgres + R2, not Git.

## Deployment Checklist

1. Confirm `npm run typecheck`, `npm test`, and `npm run build` pass locally.
2. Provision Postgres.
3. Provision Cloudflare R2 bucket and API token.
4. Add production env vars to the host.
5. Deploy from GitHub `main`.
6. Verify `/api/health` reports `storeDriver: "postgres"` and `assetStorageDriver: "r2"`.
7. Run one low-cost live generation.
8. Confirm the resulting image URL points to `/api/assets/...` or the configured R2 public base URL.
9. Confirm reloads and redeploys keep the run visible.

## Current Deferrals

The app still uses the existing direct fal queue polling path for generation. That keeps the UI stable for this handoff. A future pass can move individual provider calls to fal webhooks once the hosted Postgres/R2 path is proven.

Do not add Trigger.dev, Inngest, WebSockets, or a new frontend framework until a concrete workflow requires it.
