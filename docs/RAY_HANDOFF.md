# Ray Catalyst Studio Handoff

This is the starting point for Ray or Ray's coding agent.

## What This Repo Is

Catalyst Studio is a local creative-generation workbench for design workflows Ray and Adam discussed:

- Mockup Catalyst: generate website/app/interface mockups from prompts, references, and brand details.
- Logo Catalyst: generate logos, optionally provide exact hex palettes, use Recraft vector mode, and vectorize raster logo outputs.
- Editable Conversion: turn raster mockups into editable HTML/CSS with a canvas editor, source view, asset inspection, prompt-to-edit, and export.
- Brand Catalyst: create a brand identity workflow from a brief and references.
- Slide deck support: scaffolded as a `deck` task, currently mock/planner-only until a real deck provider is added.

The app is local-first. Provider API keys stay on the backend. Routine tests run in mock mode so they do not spend API money.

## First Commands For An Agent

Start every work session by checking the real repo state:

```sh
git fetch origin
git status --short --branch
git log --oneline --decorate --max-count=8 --all
```

If remote work exists, pull/rebase it before editing unless doing so would overwrite local user work.

## Local Setup

Use Node.js 22 or newer.

```sh
npm install
cp .env.example .env
```

For safe local validation, keep:

```sh
CATALYST_PROVIDER_MODE=mock
```

Then run:

```sh
npm run dev
```

Open:

```text
http://127.0.0.1:5190/
```

The backend API is:

```text
http://127.0.0.1:5191/api/health
```

If Ray has live keys available, set them only in `.env` or the shell environment:

```sh
CATALYST_PROVIDER_MODE=live
FAL_KEY=...
OPENROUTER_API_KEY=...
```

Never put API keys in React code, screenshots, committed files, or chat messages.

## Known Routes

- `/`: Catalyst tool hub.
- `/mockup`: Mockup Catalyst.
- `/logo` or `/logos`: Logo Catalyst.
- `/editable`: raster mockup to editable HTML/CSS.
- `/brand` or `/brands`: Brand Catalyst.
- `/asset`: intentionally redirects back to the tool hub. There is no standalone Asset Catalyst page.

## Architecture Map

Use the architecture instead of patching around it.

- `packages/core/src/registry.ts`: source of truth for tasks, models, edit models, aspect ratios, input fields, output shapes, costs, and upscalers.
- `packages/core/src/run-schema.ts`: shared run request and run output types.
- `apps/api/src/server.ts`: HTTP routes.
- `apps/api/src/runner.ts`: generation, enhancement, vectorization, edit-image, and conversion orchestration.
- `apps/api/src/providers/fal.ts`: fal queue/direct calls.
- `apps/api/src/providers/openrouter.ts`: shared OpenRouter helper. Do not hand-roll OpenRouter `fetch` calls.
- `apps/api/src/providers/extractor.ts`: raster mockup to editable HTML/CSS pipeline.
- `apps/api/src/providers/brandPipeline.ts`: Brand Catalyst pipeline.
- `apps/api/src/store/runStore.ts`: durable local run storage. It keeps fal.ai storage URLs instead of only browser-session state.
- `apps/web/src/App.tsx`: tool hub, task workbench, metadata-driven model controls.
- `apps/web/src/components/RunResults.tsx`: gallery, result modal, prompt copy, vector x-ray, enhancement, vectorization, edits, delete.
- `apps/web/src/components/EditableMockupPage.tsx`: upload-based editable conversion entrypoint.
- `apps/web/src/components/MockupEditor.tsx`: visual editor, source view, asset inspector, prompt-to-edit, export.
- `apps/web/src/components/BrandCatalystPage.tsx`: brand identity UI.

## Model And Provider Rules

- Add model capability data in `packages/core/src/registry.ts`.
- The frontend should render model controls from `/api/capabilities`.
- Do not hard-code provider-specific model forms in React.
- Each model declares its exact aspect ratios. Do not use generic "portrait" or "landscape" labels without exact values.
- GPT-Image-2 quality applies to GPT-Image-2 only.
- Nano Banana 2 edit mode has no quality setting.
- Recraft V4.1 should stay one model with `Pro` and `Vector` settings, not four model entries.
- Recraft raster-to-SVG vectorization is a result-level action that calls `fal-ai/recraft/vectorize`.
- OpenRouter calls must use `apps/api/src/providers/openrouter.ts`.
- Do not set `max_tokens` or `max_completion_tokens` on OpenRouter calls. Catalyst often asks for strict JSON with full HTML/CSS strings, and caps cause truncation.

## Prompt Enhancement Rule

For Mockup Catalyst, "mockup" means the standalone website, app screen, or interface design.

Do not let prompt enhancement turn it into:

- a browser window
- a laptop or monitor scene
- a desktop screenshot
- an image of a computer
- device chrome or presentation framing

Only add those when the user explicitly asks for that presentation.

## Editable Mockup Conversion Rule

Do not extract assets by mechanically cropping screenshot pixels.

The correct workflow is:

1. Analyze the full mockup with the OpenRouter planner model, default `~anthropic/claude-sonnet-latest`.
2. Ask the planner for layout structure, asset bounding boxes, text, overlays, gradients, and extraction instructions.
3. Render a red box/label overlay on the full mockup for each target asset.
4. Send the full marked mockup to the image-editing model with exact instructions for the asset to regenerate.
5. Tell the image model what not to include: overlay text, gradients, buttons, badges, cards, navigation, page margins, and surrounding layout.
6. Use Pixelcut background removal only when the asset should be a transparent cutout.
7. Rebuild text, overlays, masks, gradients, and buttons as editable HTML/CSS.

Cropping may be used only as a locator or fallback. Do not present cropped chunks as clean extracted assets.

## Verification Before Calling Work Done

Run:

```sh
npm run typecheck
npm test
npm run build
```

Then restart the local service and visually test the real paths:

- `/` loads the tool hub and links to Mockup, Logo, Editable Conversion, and Brand Catalyst.
- `/mockup` can create a mock-mode run and shows preserved aspect ratio results.
- `/logo` keeps palette optional, reflects selected styles/settings, can open result actions, can delete failed runs, and can vectorize a raster logo.
- `/editable` uploads a raster mockup, opens the editor, supports element selection/manipulation, prompt-to-edit, asset inspection, and Export HTML.
- `/brand` submits a brand identity run and renders the persisted result.

If a real provider test is needed, use one cheap output at the lowest useful setting and report the exact model and approximate spend.

## Sync Rule

After changes are finished:

1. Restart and test locally.
2. Report exactly what changed and what was tested.
3. Ask Adam/Ray to confirm the app works.
4. Push/sync to GitHub only after that explicit confirmation.

Do not send emails, invite collaborators, deploy, or spend live API credits unless the user explicitly asks for that action.
