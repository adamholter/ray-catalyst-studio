# Testing

Default tests run in mock mode and should not spend money.

```sh
npm run typecheck
npm run test
npm run build
```

## E2E Coverage

The Playwright tests verify:

- `/api/capabilities` drives the frontend.
- A mockup run can be created.
- Results appear in the masonry grid.
- Generated images keep a portrait aspect ratio.
- SynthID/upscaler metadata is visible in the inspector.

## Live Testing

Live tests are optional and should be rare.

Use:

```sh
CATALYST_PROVIDER_MODE=live FAL_KEY=... npm run dev
```

Rules:

- one output
- cheap model first
- low settings
- report the exact model tested
- stop after proving the provider path
