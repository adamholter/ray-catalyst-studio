---
name: ray-catalyst
description: Maintain Ray's Catalyst Studio: composable frontend/backend model interfaces, provider contracts, upscalers, and tests.
---

# Ray Catalyst Skill

Use this skill whenever changing Catalyst Studio.

## Core Operating Rules

1. **Pull before changing.**
   Always check for GitHub changes you have not received before editing:
   ```sh
   git fetch origin
   git status
   git log --oneline --decorate --max-count=5 --all
   ```
   Pull/rebase remote work before starting unless it would overwrite local user work.

2. **Do not sync until the user confirms.**
   After changes are finished and tested, ask the user to confirm the app is working. Do not push, sync, or publish changes until that confirmation is explicit.

3. **Restart the server yourself.**
   Ray is non-technical. Do not hand him commands as the next step. If you changed app code, restart the local server and verify the browser path.

4. **Keep secrets server-side.**
   Provider keys belong in `.env` and backend process env only. Never expose keys in React, static HTML, screenshots, logs, commits, or docs.

5. **Do not cap OpenRouter completions.**
   Do not set `max_tokens` or `max_completion_tokens` on OpenRouter calls. Catalyst uses long strict-JSON responses with embedded HTML/CSS; caps cause truncation and broken edits.

6. **Use branches for collaboration.**
   Do not push directly to `main`. Use short-lived branches and wait for user confirmation before syncing.

## Architecture Rules

- `packages/core/src/registry.ts` is the source of truth for model metadata:
  - model id
  - provider endpoint
  - supported task ids
  - input field specs
  - output shape
  - SynthID/watermark policy
  - default postprocessors/upscalers
- `apps/api` owns provider execution, queue polling, postprocessing, storage, and validation.
- Hosted mode uses Postgres for run records and Cloudflare R2 for generated assets. Read `docs/HOSTED_DEPLOYMENT.md` before changing hosted/runtime behavior.
- `apps/web` renders controls from `/api/capabilities`. It should not know provider endpoint details.
- Upscalers are interchangeable. Add them to `UPSCALER_REGISTRY` and call them through the backend runner.
- Models that may carry SynthID should set `synthId.applyUpscaleByDefault = true` only when the product wants the default cleanup path.

## Feature Workflow

When Ray asks for a new feature such as slide presentations:

1. Add or update task/model specs in `packages/core`.
2. Add backend runner/provider support in `apps/api`.
3. Add frontend UI only by consuming the metadata/API.
4. Add mock-mode tests first.
5. Add one cheap live smoke test only if needed.
6. Restart the app and test the visible workflow.
7. Ask for confirmation before pushing.

## Test Discipline

- Prefer mock mode for routine tests:
  ```sh
  CATALYST_PROVIDER_MODE=mock npm run test
  ```
- For live tests:
  - one image/output
  - lowest useful quality
  - cheapest model that exercises the path
  - report any money-spending test explicitly

## Best-Practice Defaults

- Keep UI clean, dense, and practical.
- Do not add a landing page around the tool.
- Do not hard-code model-specific forms in the frontend.
- Do not add a provider by copying an old model call into React.
- Do not use global aspect-ratio controls. Each generation model declares its own exact supported ratios and whether the backend sends `aspect_ratio` or `image_size`.
- Do not extract editable mockup assets by cropping screenshot pixels. Send the full mockup to an image-editing model with asset position, exclusions, and clean-output instructions; use crop boxes only as location hints.
- For image-to-website conversion, use the agent pipeline: Agents SDK + OpenRouter planner, red-box full-mockup overlays per asset, image-model extraction from the marked full mockup, and Pixelcut background removal only for transparent cutouts.
- Do not use hidden static browser API keys.
- Do not hand-roll OpenRouter fetch calls; use `apps/api/src/providers/openrouter.ts`.
- Prefer `CATALYST_LLM_PROVIDER=fal-openrouter` for Ray's normal setup so `FAL_KEY` can power both image models and LLM planning.
- Do not rely on fal media URLs as durable storage for shared/client work. Copy generated assets to R2 when hosted storage is enabled.
- For the `mockup` task, do not reinterpret "mockup" as a browser/device presentation. It means the standalone page or interface design unless the user explicitly asks for device framing.
- Do not tell Ray to restart the server; do it.
