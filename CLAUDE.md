# Claude Guide For Ray

Read `docs/RAY_HANDOFF.md` and `skills/ray-catalyst/SKILL.md` before making changes.
For hosted collaboration, also read `docs/HOSTED_DEPLOYMENT.md`.

Ray is non-technical. Do not ask him to run commands. If you change the app, you are responsible for:

1. Pulling the latest repo changes first.
2. Making the change in the correct layer.
3. Restarting the local server.
4. Testing the app end-to-end.
5. Waiting for Ray/Adam to confirm everything works before pushing or syncing.
6. Once confirmed, publishing the change through a feature branch and pull request. Do not leave approved work only on the local computer.

Keep model details centralized in `packages/core/src/registry.ts`.
Keep generated runs/assets out of Git. Hosted state belongs in Postgres and Cloudflare R2; local state belongs in `.data`.
Use feature branches and do not push directly to `main`.
GitHub is the shared source of truth. Follow `docs/COLLABORATION.md` so updates made by Adam or Ray become available to the other person. Never use an automatic background pull that could overwrite uncommitted work.

Do not set `max_tokens` or `max_completion_tokens` on OpenRouter calls. Use the shared backend OpenRouter helper and let long JSON/HTML/CSS responses complete.
Ray's normal live setup should only need `FAL_KEY`; LLM planning can use fal's OpenRouter-compatible endpoint with `CATALYST_LLM_PROVIDER=fal-openrouter`.
