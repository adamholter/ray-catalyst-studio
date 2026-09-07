# Catalyst Collaboration

GitHub is the shared source of truth for Catalyst code. Adam and Ray can both make updates through their local coding agents. Hosted deployment support is implemented, but a connected host and automatic deployment have not been verified. These Git instructions alone do not deliver background updates to Ray.

## Start Every Change

```sh
git fetch origin
git status --short --branch
git switch main
git pull --ff-only
git switch -c <name>/<short-change-name>
```

If `git status` shows uncommitted work, do not pull over it. Keep that work on its current branch, commit it when appropriate, or stop and explain the conflict.

## Verify And Publish

Do not publish until Adam or Ray confirms the user-facing change works.

After confirmation:

```sh
git fetch origin
git rebase origin/main
npm run validate
git push -u origin HEAD
```

Then open a pull request into `main`. Merge only after the `validate` check passes. Once merged:

```sh
git switch main
git pull --ff-only
```

The agent should perform these operations itself. Ray should not be handed terminal commands as the next step.

## How Code Updates Travel

- Adam's approved changes are pushed and merged into GitHub `main`; Ray's agent pulls them before work.
- Ray's approved changes are pushed and merged into GitHub `main`; Adam's agent pulls them before work.
- Both people remain collaborators with write access. Public visibility allows cloning without repository authentication, but pushing still requires the collaborator's GitHub login.
- No background process automatically merges or overwrites local files. Git branches, pull requests, CI, and explicit fast-forward pulls provide the sync safely.

For updates Ray can receive without running Claude, complete the hosted deployment checklist in `HOSTED_DEPLOYMENT.md`, connect protected `main`, and require successful CI before deployment. Verify an approved commit reaches the hosted URL before calling background delivery active. Local checkouts still need an explicit pull; generated data does not travel through Git.

## Never Sync

- `.env` files or API keys
- local run data under `.data`
- generated images, exports, test reports, or temporary API files
- client-confidential content

The repository's source check rejects common fal.ai and OpenAI-style key formats, and GitHub secret scanning remains an additional backstop.
