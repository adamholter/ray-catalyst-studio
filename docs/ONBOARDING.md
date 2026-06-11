# Catalyst Studio Agent Onboarding

Read this before making changes for Ray.

## What This Is

Catalyst Studio is a registry-driven creative-generation studio with three layers:

- `packages/core`: shared contracts only. Model registry, task specs, upscalers, and run schema.
- `apps/api`: execution layer. Provider calls, secrets, queue polling, persistence, and postprocessing.
- `apps/web`: React workbench. Renders model controls from `/api/capabilities` and submits runs to the backend.

Ray is non-technical. If you change the app, restart and verify it yourself. Do not hand Ray terminal commands as the next step.

## Golden Rules

- Pull/check for remote changes before editing.
- Do not push or sync until Adam/Ray confirms the app works.
- Keep provider keys server-side only.
- Keep model capabilities centralized in `packages/core/src/registry.ts`.
- Do not hard-code provider endpoints or model-specific forms in React.
- Do not set `max_tokens` or `max_completion_tokens` on OpenRouter calls. Catalyst often asks models to return JSON containing HTML/CSS, and token caps can truncate the response mid-string.
- Use mock mode for routine tests. Run live generations only when necessary, with one cheap model at the lowest useful settings.

## Mockup Terminology

In Catalyst, a website/app mockup means the standalone design itself. It does not mean a browser window, laptop photo, desktop monitor, phone render, or presentation scene.

When writing or enhancing prompts for the `mockup` task:

- Ask for the page/screen/interface directly.
- Do not add browser chrome, address bars, OS windows, device frames, hands, desks, monitors, or computer surroundings.
- Only include those presentation elements when the user explicitly asks for a browser/device mockup.

## Key Files

- `packages/core/src/registry.ts`: tasks, models, upscalers, defaults, field specs, output specs.
- `packages/core/src/run-schema.ts`: run request and response types.
- `apps/api/src/server.ts`: HTTP routes.
- `apps/api/src/runner.ts`: generation, enhancement, vectorization, and image-edit execution.
- `apps/api/src/providers/openrouter.ts`: shared OpenRouter helper. Use this instead of hand-rolling OpenRouter fetch calls.
- `apps/api/src/providers/fal.ts`: fal queue polling and storage upload.
- `apps/api/src/providers/extractor.ts`: raster-to-editable-HTML converter.
- `apps/web/src/App.tsx`: main workbench and route selection.
- `apps/web/src/components/RunResults.tsx`: gallery, result modal, enhancement/vector/edit actions.
- `apps/web/src/components/EditableMockupPage.tsx`: editable mockup conversion page.

## Editable Mockup Converter Notes

The converter should use the uploaded screenshot as source of truth. Extracted image assets should be clean raw assets: text, navigation, buttons, readability gradients, and dark tints belong in editable HTML/CSS, not baked into extracted images.

The image-to-website path is an agent loop. The OpenRouter planner uses the Agents SDK with `CATALYST_IMAGE_TO_WEBSITE_AGENT_MODEL` (default `~anthropic/claude-sonnet-latest`) to identify layout structure, asset boxes, extraction prompts, and whether Pixelcut background removal is needed. For each asset, the backend renders a red box on the full mockup, sends that marked full mockup to the image model, and only then optionally runs Pixelcut for transparent cutouts.

When OpenRouter analysis is unavailable, the fallback is only a generic editable landing-page scaffold. Do not present the fallback as a high-fidelity arbitrary-layout converter.

## Enhancement And Watermark Notes

Enhancement/upscaling is currently a per-result action in the result modal. It is not automatic and should not be described as guaranteed invisible-watermark removal. If the product decision changes, add an explicit postprocess path through `UPSCALER_REGISTRY` and `apps/api/src/runner.ts`.

## Verification

Before reporting done:

```sh
npm run typecheck
npm test
npm run build
```

Then restart the local service and visually verify the real route in the browser.
