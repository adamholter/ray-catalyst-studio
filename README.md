# Catalyst Studio

Composable creative-generation studio for Ray.

This repo replaces one-off static Catalyst tools with a separated frontend/backend architecture:

- `packages/core`: shared model registry, input/output contracts, and result-action registry.
- `apps/api`: backend API that owns provider calls and secrets.
- `apps/web`: frontend workbench that renders model controls from backend metadata.
- `skills/ray-catalyst`: embedded agent instructions for safe future changes.
- `tests/e2e`: end-to-end workflow tests that run in mock mode by default.

The app is still local-friendly, but it is now prepared for hosted collaboration: the API can serve the built web app as one always-on service, store runs in Postgres, and copy generated assets into Cloudflare R2 when those env vars are configured.

## Local Run

```sh
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:5190
```

Normal use defaults to live mode and requires `FAL_KEY`. Missing credentials produce an error, never simulated results. Automated tests explicitly select mock mode on separate test ports and do not spend API money.

The API reads the repository-root `.env` regardless of the launch directory. Explicit process environment variables take precedence. Catalyst never reads another project's Keychain credentials. On a host, `PORT` takes precedence over the local `CATALYST_API_PORT` setting.

Local API access defaults to loopback. Production or a host-provided `PORT` binds all interfaces; use `CATALYST_API_HOST` to override. Hosted access requires authentication or an access-controlled host because generation spends the server's provider key.

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

- [docs/RAY_HANDOFF.md](docs/RAY_HANDOFF.md)
- [docs/RAY_CLAUDE_PROMPT.md](docs/RAY_CLAUDE_PROMPT.md)
- [skills/ray-catalyst/SKILL.md](skills/ray-catalyst/SKILL.md)
- [docs/ONBOARDING.md](docs/ONBOARDING.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/HOSTED_DEPLOYMENT.md](docs/HOSTED_DEPLOYMENT.md)
- [docs/COLLABORATION.md](docs/COLLABORATION.md)
- [docs/ADDING_FEATURES.md](docs/ADDING_FEATURES.md)

Do not push/sync code to GitHub until the user confirms the app is working.
After confirmation, publish through a feature branch and pull request so the update is available to both Adam and Ray. GitHub `main` is the shared source of truth; see [docs/COLLABORATION.md](docs/COLLABORATION.md).

## Share Handoff

For Ray, start with [docs/RAY_HANDOFF.md](docs/RAY_HANDOFF.md). It explains what the app does, how his Claude agent should run it locally, where the architecture lives, and what to test before calling work done.

For hosted collaboration, use [docs/HOSTED_DEPLOYMENT.md](docs/HOSTED_DEPLOYMENT.md). Do not put generated assets or provider keys in Git.
