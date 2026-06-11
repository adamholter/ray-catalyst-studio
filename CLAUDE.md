# Claude Guide For Ray

Read `docs/RAY_HANDOFF.md` and `skills/ray-catalyst/SKILL.md` before making changes.

Ray is non-technical. Do not ask him to run commands. If you change the app, you are responsible for:

1. Pulling the latest repo changes first.
2. Making the change in the correct layer.
3. Restarting the local server.
4. Testing the app end-to-end.
5. Waiting for Ray/Adam to confirm everything works before pushing or syncing.

Keep model details centralized in `packages/core/src/registry.ts`.

Do not set `max_tokens` or `max_completion_tokens` on OpenRouter calls. Use the shared backend OpenRouter helper and let long JSON/HTML/CSS responses complete.
