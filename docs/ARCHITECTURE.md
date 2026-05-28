# Architecture

Catalyst Studio is intentionally split into three layers.

## 1. Shared Core

`packages/core` contains the contracts every layer uses:

- `TASKS`: top-level creative jobs such as mockups, logos, assets, and decks.
- `MODEL_REGISTRY`: model capability metadata.
- `UPSCALER_REGISTRY`: interchangeable postprocessors.
- `createRunRequestSchema`: request validation.
- `RunRecord`: durable run shape returned by the backend.

The registry is how the frontend learns the "ins and outs" of each model: input parameters, output shapes, default postprocessors, cost/speed tier, and SynthID policy.

## 2. Backend API

`apps/api` owns all execution:

- `GET /api/capabilities`: returns tasks, models, upscalers, and defaults.
- `POST /api/runs`: validates a run, calls the selected model, applies postprocessors, and stores the result.
- `GET /api/runs`: returns local run history.
- `GET /api/runs/:id`: returns one run.

Provider credentials stay in backend env vars.

## 3. Frontend

`apps/web` is a metadata-driven workbench. It should:

- fetch `/api/capabilities`
- render fields from `model.inputFields`
- submit `/api/runs`
- display outputs according to `model.output`
- preserve image aspect ratios in the masonry result grid

The frontend should not know FAL/OpenAI endpoint details.

## SynthID And Upscaling

Google DeepMind describes SynthID as an imperceptible watermark for AI-generated media. Google Cloud also documents SynthID watermarking for Imagen model versions that support watermarking.

Registry policy:

- Models with likely/expected SynthID set `synthId.status`.
- The default cleanup path is `defaultPostprocessors: ["aura-sr"]`.
- AuraSR is registered as an interchangeable upscaler, not hard-coded into a model.

Sources:

- Google DeepMind SynthID: https://deepmind.google/science/synthid/
- Google Cloud watermark verification: https://cloud.google.com/vertex-ai/generative-ai/docs/image/verify-watermark
- FAL AuraSR endpoint: https://fal.ai/models/fal-ai/aura-sr/api
- FAL Grok Imagine endpoint: https://fal.ai/grok-imagine
