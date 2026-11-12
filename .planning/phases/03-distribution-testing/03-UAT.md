---
status: testing
phase: 03-Distribution & Testing
source: [03-VERIFICATION.md]
started: 2026-11-12T07:48:00Z
updated: 2026-11-12T07:48:00Z
---

## Current Test

number: 1
name: Three-host RC validation — Claude Desktop, Cursor, VS Code
expected: |
  For each host, following docs/host-smoke-test.md: the config file is placed
  where that host reads it, `${workspaceFolder}` / `PIO_WORKSPACE_ROOT` resolve,
  the server starts and answers `tools/list` with 12 tools, and a build
  completes. All three sign-off rows read PASS.
awaiting: user response

## Tests

### 1. Three-host RC validation — Claude Desktop, Cursor, VS Code
expected: `docs/host-smoke-test.md` sign-off table (all three hosts PASS); server starts, 12 tools listed, a build completes, Windows `pio_serial_start` returns PLATFORM_UNSUPPORTED (-32010).
result: [pending]
why_human: GUI host config placement, variable interpolation, and startup behaviour are invisible from a headless sandbox. Needs ~45-60 minutes across the three hosts; a failing host blocks the release.

### 2. Publish the RC under `next`
expected: push `v0.2.0-rc.1` (or `npm publish --tag next`) → `npm view @zandev32/pioneer dist-tags --json` returns `{"next":"0.2.0-rc.1"}` only.
result: [pending]
why_human: requires the `NPM_TOKEN` repository secret, which only the npm account owner can create. Also the only way to exercise the never-run publish job.

### 3. Cut `0.2.0` only after sign-off
expected: `npm version 0.2.0` then push `v0.2.0` → `package.json` and `package-lock.json` both `0.2.0`, tag equals version, publish job moves `latest`.
result: [pending]
why_human: milestone gate (D-06/D-20/D-26) — must not move `latest` before host validation passes.

### 4. Decide the publish-trigger hardening
expected: the `workflow_dispatch`-on-tag hole is closed. Already fixed in `5a8d8d7` (`if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')`); confirm the hardening is accepted as-is.
result: [pending]
why_human: policy call on the recorded must-have wording.

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

- No `v0.2.0` tag exists locally or on GitHub; `@zandev32/pioneer` returns 404 from the registry; no `next` dist-tag exists; `latest` has not moved.
- Phase 03 cannot be marked complete until tests 1-3 pass (`/gsd-verify-work 03`).
