# Prompt For Ray To Paste Into Claude

Copy the prompt below into Claude after Ray has GitHub access to this private repo.

```text
Clone https://github.com/adamholter/ray-catalyst-studio, read the README and the docs in the repo first, then follow those instructions to get Catalyst Studio running locally.

Start in mock mode first and verify the app works without spending money. If I give you a fal.ai key, put it only in the local .env file as FAL_KEY=[PASTE_FAL_KEY_HERE], set CATALYST_PROVIDER_MODE=live, and leave CATALYST_LLM_PROVIDER=fal-openrouter unless the docs say otherwise. Do not commit the .env file or print the key back to me.

When it is running, give me the local URL and a short explanation of what I need to know. If you make code changes, use a branch and do not push to main directly.
```
