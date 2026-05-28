# Architecture

Catalyst Studio is intentionally split into three layers.

## 1. Shared Core

`packages/core` contains the contracts every layer uses:

- `TASKS`: top-level creative jobs such as mockups, logos, assets, and decks.
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
