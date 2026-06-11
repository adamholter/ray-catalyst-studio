# Prompt For Ray To Paste Into Claude

Copy the prompt below into Claude after Ray has GitHub access to this private repo.

```text
You are helping me run and understand a private GitHub project called Catalyst Studio.

Repo URL:
https://github.com/adamholter/ray-catalyst-studio

Your job:
1. Clone the repo locally.
2. Read README.md, AGENTS.md, CLAUDE.md, docs/RAY_HANDOFF.md, docs/ONBOARDING.md, docs/ARCHITECTURE.md, docs/ADDING_FEATURES.md, docs/TESTING.md, and skills/ray-catalyst/SKILL.md before changing anything.
3. Explain in simple terms what the app does and which local URL I should open.
4. Install dependencies and start the app locally.
5. Use mock mode first so we do not spend API credits while verifying the setup.
6. If I provide FAL_KEY or OPENROUTER_API_KEY, keep those secrets server-side in .env only. Do not paste, print, screenshot, or commit them.
7. Open the local app and verify the main user paths:
   - / loads the tool hub.
   - /mockup opens Mockup Catalyst.
   - /logo opens Logo Catalyst.
   - /editable opens the editable mockup converter.
   - /brand opens Brand Catalyst.
8. If something fails, diagnose and fix it yourself, then restart the server and test again. Do not just tell me to run commands unless a real account, permission, or device boundary blocks you.

Important architecture rules:
- Keep model/provider knowledge in packages/core/src/registry.ts.
- Keep provider execution in apps/api.
- Keep React metadata-driven from /api/capabilities.
- Do not hard-code model-specific forms in React.
- Do not set max_tokens or max_completion_tokens on OpenRouter calls.
- For mockup prompts, a "mockup" means the standalone website/app/interface design, not a browser window or computer scene.
- For raster-to-editable conversion, do not crop screenshot pixels as final image assets. Use the full mockup plus marked bounding boxes and an image model extraction prompt; use Pixelcut background removal only when a transparent cutout is needed.

When you are done:
- Tell me the local URL.
- Tell me which checks passed.
- Explain any remaining limitations in plain English.
- Do not push/sync to GitHub until I confirm the local app works.
- Do not send emails, deploy, invite collaborators, or spend live API credits unless I explicitly ask.
```
