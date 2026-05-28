# Adding Features

## Add A New Model

1. Add a `ModelSpec` to `MODEL_REGISTRY` in `packages/core/src/registry.ts`.
2. Describe every input as a `FieldSpec`.
3. Describe the output shape.
4. Set SynthID policy and default postprocessors.
5. Add or adjust tests in `packages/core/src/registry.test.ts`.
6. If the provider is new, add an adapter in `apps/api/src/providers`.
7. Verify the frontend renders the model without hard-coded UI changes.

## Add A New Upscaler

1. Add an `UpscalerSpec` to `UPSCALER_REGISTRY`.
2. Keep it interchangeable by id.
3. Update `apps/api/src/runner.ts` only if the provider call shape requires a new adapter.
4. Add tests that prove SynthID-prone models route to the right default upscaler.

## Add Slide Presentations

The `deck` task already exists as a mock-mode planner. To make it real:

1. Add a real deck model or Codex-task provider to the registry.
2. Define inputs such as images, screenshots, instructions, brand notes, and slide count.
3. Define output as a deck plan, generated images, and eventually PPTX/Google Slides artifacts.
4. Add backend execution for the provider.
5. Keep the frontend generic: the form should come from model metadata.
6. Add e2e tests that create a deck run in mock mode before any live provider test.

## Safe Sync Process

1. Pull latest remote changes.
2. Make the change.
3. Restart and test locally.
4. Ask the user to confirm it works.
5. Only then push to GitHub.
