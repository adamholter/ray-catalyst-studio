# Catalyst Studio Agent Instructions

This is Ray's composable creative-generation studio. Keep the architecture clean and make changes in the right layer.

## Before Work

1. Check GitHub for remote changes before editing:
   ```sh
   git fetch origin
   git status
   git log --oneline --decorate --max-count=5 --all
   ```
2. If remote changes exist, pull/rebase them before starting unless doing so would overwrite local user work.
3. Never commit secrets, real client data, generated API keys, or provider tokens.

## During Work

- Put model/provider knowledge in `packages/core/src/registry.ts`.
- Put provider execution in `apps/api/src/providers/**` and `apps/api/src/runner.ts`.
- Keep provider keys server-side only.
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

## Non-technical User Rule

Ray may ask in plain English. Translate his request into the architecture above, do the work, restart the server, verify the app, and explain the outcome simply.
