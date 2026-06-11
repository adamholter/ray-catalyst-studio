# Architecture

Catalyst Studio is intentionally split into three layers.

## 1. Shared Core

`packages/core` contains the contracts every layer uses:

- `TASKS`: top-level creative jobs such as mockups, logos, assets, and brands.
- `MODEL_REGISTRY`: model capability metadata.
- `UPSCALER_REGISTRY`: interchangeable postprocessors.
- `createRunRequestSchema`: request validation.
- `RunRecord`: durable run shape returned by the backend.

The registry is how the frontend learns the "ins and outs" of each model: input parameters, output shapes, available result actions, and cost/speed tier.

## 2. Backend API

`apps/api` owns all execution:

- `GET /api/capabilities`: returns tasks, models, upscalers, and defaults.
- `POST /api/runs`: validates a run, calls the selected model, and stores the result.
- `POST /api/runs/:id/upscale`: applies a result-level enhancement when the user asks for it.
- `GET /api/runs`: returns local run history.
- `GET /api/runs/:id`: returns one run.

Provider credentials stay in backend env vars.

### OpenRouter Calls

Use `apps/api/src/providers/openrouter.ts` for OpenRouter requests. Do not hand-roll separate OpenRouter `fetch` calls in feature providers.

Do not set `max_tokens` or `max_completion_tokens`. Catalyst often asks LLMs to return strict JSON that contains full HTML/CSS strings; token caps can truncate the response and make downstream JSON parsing fail or silently preserve stale output.

Prompt enhancement is allowed to clarify quality, structure, and style, but it must not change Catalyst task semantics. For the `mockup` task, "mockup" means a standalone page/screen/interface design, not a browser chrome, device frame, monitor photo, or computer scene unless the user explicitly requests that presentation.

### Aspect Ratios

Aspect ratios are part of each model contract, not global UI state. Add supported ratios to the model's `aspectRatio` field metadata with the provider input target:

- fal models that accept `aspect_ratio` should send the exact selected ratio string.
- fal models that accept `image_size` should map each displayed ratio to the documented enum such as `landscape_16_9` or to documented custom `{ width, height }` dimensions.
- Do not add generic labels like "Portrait" without the exact ratio value.
- When a selected model does not support the current ratio, coerce to the nearest supported ratio before queuing the run.

## 3. Frontend

`apps/web` is a metadata-driven workbench. It should:

- fetch `/api/capabilities`
- render fields from `model.inputFields`
- submit `/api/runs`
- display outputs according to `model.output`
- preserve image aspect ratios in the masonry result grid

The frontend should not know FAL/OpenAI endpoint details.

## Result Enhancements

Enhancement/upscaling is a per-result action, not an automatic generation step and not a main-sidebar control.

Policy:

- Generate first.
- Let the user open an individual result.
- Offer enhancement, download, and copy actions inside that result modal.
- Keep enhancers interchangeable by id in `UPSCALER_REGISTRY`.
- Do not describe upscaling as guaranteed invisible-watermark removal unless a specific provider path has been verified for that purpose.

## Editable Mockup Asset Extraction

Raster-to-editable conversion should not treat image assets as mechanical screenshot crops. The layout analyzer may provide bounding boxes, but those boxes are only location hints for the extraction model.

The conversion pipeline is an agent-style loop:

1. The OpenRouter image-to-website planner runs through the Agents SDK using `CATALYST_IMAGE_TO_WEBSITE_AGENT_MODEL`, defaulting to `~anthropic/claude-sonnet-latest`.
2. The planner returns editable layout copy plus per-asset bounding boxes, extraction instructions, cleanup rules, and whether Pixelcut background removal is needed.
3. The backend renders a red bounding box/label overlay on top of the full source mockup for each asset.
4. The image-editing model receives the full marked mockup and an extraction prompt. The box is only a locator; the model must regenerate the clean asset, not crop pixels.
5. Pixelcut (`pixelcut/background-removal`) runs only for assets that should become transparent cutouts, such as icons, logos, stickers, foreground objects, and mascots.
6. The editable HTML/CSS is generated using the clean asset URLs, with text, gradients, overlays, masks, and buttons rebuilt as editable markup/CSS.

For each detected image asset:

- send the full source mockup to the image-editing model
- include the red-box marked version for the specific target asset when available
- describe the asset's position and visual contents
- explicitly name what should be excluded, such as text overlays, cards, buttons, gradients, badges, page margins, and surrounding layout
- ask for one clean standalone asset that can be embedded directly in HTML/CSS
- use background removal only when the intended asset needs transparency; do not run it on normal rectangular photos or hero/background images

Only use placeholder assets when model extraction is unavailable or fails. Do not silently substitute cropped chunks of the full mockup as if they were clean assets.
