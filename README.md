# Catalyst Studio

Composable creative-generation studio for Ray.

This repo replaces one-off static Catalyst tools with a separated frontend/backend architecture:

- `packages/core`: shared model registry, input/output contracts, and result-action registry.
- `apps/api`: backend API that owns provider calls and secrets.
- `apps/web`: frontend workbench that renders model controls from backend metadata.
- `skills/ray-catalyst`: embedded agent instructions for safe future changes.
- `tests/e2e`: end-to-end workflow tests that run in mock mode by default.

## Local Run

```sh
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:5190
```

If `FAL_KEY` is present, the local app runs live by default. Automated tests force mock mode on separate test ports so routine validation does not spend API money.

## Live Provider Mode

Only run extra live generations when a real provider test is necessary.

```sh
cp .env.example .env
# set CATALYST_PROVIDER_MODE=live
# set FAL_KEY=...
npm run dev
```

Keep live tests to one cheap run at the lowest useful settings unless Adam/Ray explicitly asks for more.

## Agent Rules

Before editing, read:

- [skills/ray-catalyst/SKILL.md](skills/ray-catalyst/SKILL.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/ADDING_FEATURES.md](docs/ADDING_FEATURES.md)

Do not push/sync code to GitHub until the user confirms the app is working.
