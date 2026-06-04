# ZakLife Operations Workflow

This is the working process for ZakLife and Monstea automation.

## Pipeline

```text
local edit -> GitHub -> CI check -> staging -> production -> automation -> monitoring
```

## Current implementation

- Local app: `C:\Users\pc\Desktop\Zak`
- Working repo: `C:\Users\pc\Desktop\Codex\zaklife-push`
- Production branch: `main`
- Staging branch: `staging`
- CI template: `docs/ci/zaklife-ci.yml`
- Production site: GitHub Pages from the repository
- Content data: Firebase path `zaklife/content-calendar`
- Monstea posting worker: `C:\Users\pc\Desktop\Monstea\n8n\scripts\post_due_facebook.py`
- Automation heartbeat: Firebase path `zaklife/automation/monsteaFacebook`

## Rules

1. Do not put API keys in frontend files.
2. Content schedule must store timezone, for example `2026-06-04T17:45:00+07:00`.
3. Only posts with `status: "approved"` can be posted by automation.
4. If automation is late by more than 30 minutes, mark the post as `missed` instead of posting late.
5. n8n and Windows Task Scheduler may both scan due posts, but the Python worker uses a lock to avoid duplicates.
6. Every code push must pass JavaScript/Python syntax checks before being treated as safe.

Note: GitHub rejected creating `.github/workflows/ci.yml` because the current token does not have `workflow` scope. To activate CI later, move `docs/ci/zaklife-ci.yml` to `.github/workflows/ci.yml` using a token/account with workflow permission.

Fast activation path:

1. Give GitHub token permission to edit workflow files.
2. Move `docs/ci/zaklife-ci.yml` to `.github/workflows/ci.yml`.
3. Push `staging`.
4. If CI passes and local staging looks correct, merge `staging` into `main`.

## Staging design

Use a separate branch named `staging`.

Flow:

```text
feature/local -> staging branch -> test URL or local copied app -> main branch
```

Until a real staging URL is configured, staging means:

- run CI on the `staging` branch,
- copy changed files into `C:\Users\pc\Desktop\Zak`,
- verify the served local app,
- only then merge or push to `main`.

Commercial phase later:

- keep `main` as production,
- add Vercel preview for `staging`,
- keep GitHub Pages or Vercel production behind the same release rule.

## Automation design

Content Calendar is the source of truth.

```text
ZakLife Content Calendar
  -> Firebase zaklife/content-calendar
  -> n8n schedule or Windows backup scheduler
  -> local relay
  -> Facebook Graph API
  -> Firebase status update
  -> ZakLife shows posted / missed / failed
```

## Monitoring design

Current checks:

- automation heartbeat: `zaklife/automation/monsteaFacebook`
- content post status: `approved`, `posted`, `missed`, `failed`
- relay health: `http://127.0.0.1:8787/health`
- post log: `C:\Users\pc\Desktop\Monstea\n8n\logs\post-log.jsonl`
- if no heartbeat appears for more than 20 minutes, Dashboard marks automation as stale.

Next step:

- send Telegram/Zalo alert when no checks run for more than 20 minutes.
