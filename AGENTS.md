# Catalyst Studio Agent Instructions

This is Ray's composable creative-generation studio. Keep the architecture clean and make changes in the right layer.

Start with `docs/RAY_HANDOFF.md` for the complete Ray-facing handoff, setup, architecture map, and verification checklist.

## Before Work

1. Check GitHub for remote changes before editing:
   ```sh
   git fetch origin
   git status
   git log --oneline --decorate --max-count=5 --all
   ```
2. If remote changes exist, pull/rebase them before starting unless doing so would overwrite local user work.
3. Never commit secrets, real client data, generated API keys, or provider tokens.
4. Use a short-lived feature branch for code changes. Do not push directly to `main`.
5. Read `docs/COLLABORATION.md`. GitHub is the shared source of truth for Adam, Ray, and their agents.

## During Work

- Put model/provider knowledge in `packages/core/src/registry.ts`.
- Put provider execution in `apps/api/src/providers/**` and `apps/api/src/runner.ts`.
- Keep provider keys server-side only.
- Keep generated runs/assets in Postgres/R2 or local `.data`, never in Git.
- Make the frontend render from `/api/capabilities`; do not hard-code model-specific forms in React components.
- Add or update tests for every model contract or workflow change.
- Use mock mode for routine tests.
- If a live test is necessary, use a cheap model, one output, and the lowest useful quality.

## After Work

1. Restart the local server yourself. Do not tell Ray to run commands.
2. Run verification:
   ```sh
   npm run typecheck
   npm run test
   npm run build
   ```
3. Open the app and test the real user path.
4. Report what changed, what was tested, and what remains.
5. Do not push/sync to GitHub until the user explicitly confirms the app is working.
6. After confirmation, do not leave the update only on this computer: commit it, push the feature branch, open a pull request, and merge it after CI passes. This is how Adam and Ray receive each other's updates.

## Publishing Updates

- `main` is protected and deployable. Never force-push it.
- Each change uses a short-lived branch and pull request.
- Before opening the pull request, rebase the branch on `origin/main` and run `npm run validate`.
- After the pull request merges, update the local checkout with `git switch main && git pull --ff-only`.
- Do not use background auto-pull or auto-push. Explicit Git operations prevent uncommitted work from being overwritten.

## Hosted Mode

For hosted collaboration, read `docs/HOSTED_DEPLOYMENT.md`.

- The production app is one Node service that serves both `/api/*` and the built React app.
- Use Postgres for run records and Cloudflare R2 for generated assets.
- `FAL_KEY` should be the only required provider key for Ray's normal setup; LLM planning can use fal's OpenRouter-compatible endpoint via `CATALYST_LLM_PROVIDER=fal-openrouter`.
- Do not rely on fal media URLs, browser session state, or local files as the durable store for shared work.

## Non-technical User Rule

Ray may ask in plain English. Translate his request into the architecture above, do the work, restart the server, verify the app, and explain the outcome simply.
