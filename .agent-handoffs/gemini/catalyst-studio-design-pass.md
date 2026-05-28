# Catalyst Studio Design Pass

## Context
Adam is rebuilding Ray's Catalyst tools into a clean, composable creative-generation studio. The prior mockup/logo apps were static pages with exposed API keys, one-off model calls, and brittle UI. This new repo needs a separated backend and frontend, a model registry that describes model input/output shapes, interchangeable postprocessors/upscalers, and a component system that future agents can extend.

## Requested Product Surface
Design the primary web app screen for a minimalist light-mode internal tool called **Catalyst Studio**.

The first usable screen should be the actual workbench, not a marketing page:
- Left/work area: request composer for mockups/logos/assets/decks with prompt, task type, model selector, input fields rendered from backend model metadata, optional image/reference attachments, and run button.
- Right/detail area: capability inspector showing selected model inputs, output shape, SynthID/watermark status, default postprocessing chain, and the selected upscaler.
- Lower/results area: run timeline and generated outputs in a masonry grid that respects real image aspect ratios.
- Component library feeling: reusable buttons, segmented controls, forms, sidebars, result cards, status pills, and inspector rows.

## Design Constraints
- Minimalist light mode, operational and quiet.
- Avoid landing-page hero sections, decorative gradient blobs, nested cards, and generic AI-dashboard filler.
- Keep density efficient enough for repeated daily use.
- Use cards only for actual repeated items/result objects or interaction containers.
- Components should look reusable and systematic, not one-off.
- Typography should be deliberate and restrained. Avoid a generic SaaS look.
- Results grid must support portrait, landscape, and square generated assets.
- Show server/model architecture clearly without over-explaining in visible UI copy.

## Architecture Awareness
The backend exposes:
- `GET /api/capabilities` for tasks, model specs, field specs, output specs, and upscaler specs.
- `POST /api/runs` for generation requests.
- `GET /api/runs` and `GET /api/runs/:id` for history.

The frontend should consume these APIs, not hard-code provider-specific forms.

## Deliverable
Please inspect the repo after Codex creates the baseline. Improve or propose the frontend component structure and CSS for the Catalyst Studio web app. If editing directly, keep changes inside `apps/web/src/**` unless a small shared type change is necessary.

## Verification Expectations
- Run or inspect the app locally.
- Confirm the UI works at desktop and mobile widths.
- Ensure generated/result images preserve natural aspect ratio.
- Summarize files changed and any remaining design concerns.

## Important
You are not alone in the codebase. Do not revert backend/model architecture changes. Work with whatever baseline exists when you start.
