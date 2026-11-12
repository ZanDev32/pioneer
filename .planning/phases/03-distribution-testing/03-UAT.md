---
status: testing
phase: 03-Distribution & Testing
source: [03-VERIFICATION.md]
started: 2026-11-12T07:48:00Z
updated: 2026-11-13T01:12:00Z
order: dependency-ordered (publish -> host validation -> release cut -> hardening), reordered by user request
---

## Current Test

number: 1
name: Publish the release candidate under `next`
expected: |
  Pushing tag `v0.2.0-rc.1` runs the CI `publish` job, which publishes
  `@zandev32/pioneer@0.2.0-rc.1` with provenance and the `next` dist-tag only.
  `npm view @zandev32/pioneer dist-tags --json` returns exactly
  {"next":"0.2.0-rc.1"} — `latest` is untouched, and the package resolves from
  the registry.
awaiting: fix — `latest` dist-tag points at a prerelease

## Tests

### 1. Publish the release candidate under `next`
expected: `npm view @zandev32/pioneer dist-tags --json` → `next` only, no `latest`; `npx -y @zandev32/pioneer@next --help` prints the published version.
prerequisite: the `NPM_TOKEN` repository secret (granular token with bypass-2FA) — now present and working.
result: fail
observed: |
  Published twice and both became visible after npm's first-publish processing window:
  v0.2.0-rc.1 (run 43264560055) then v0.2.0-rc.2 (run 43265188947), provenance logged each time.
  `npx -y @zandev32/pioneer@next --help` -> "Pioneer v0.2.0-rc.2"; published `bin` is
  {"pioneer":"dist/server.js"} (rc.1 was broken: npm stripped the `./`-prefixed bin).
  FAILING CRITERION: `npm view @zandev32/pioneer dist-tags --json` ->
  {"latest":"0.2.0-rc.1","next":"0.2.0-rc.2"}. npm stamps `latest` on a brand-new package even
  when publishing with `--tag next`, so a prerelease became the default install target and the
  D-06/D-20/D-26 gate ("`latest` has not moved") is violated.
cause: npm first-publish default, not a workflow bug — but the publish job had no guard against it.
why_human: requires the npm account owner to create the secret; also the only way to exercise the never-run publish job (it is skipped on every non-tag run).

### 2. Three-host RC validation — Claude Desktop, Cursor, VS Code
expected: `docs/host-smoke-test.md` sign-off table all three rows PASS — config placed where each host reads it, `${workspaceFolder}` / `PIO_WORKSPACE_ROOT` resolve, server starts and `tools/list` returns 12 tools, a build completes; Windows `pio_serial_start` returns PLATFORM_UNSUPPORTED (-32010).
prerequisite: test 1 — the checklist installs `npx -y @zandev32/pioneer@next`.
result: [pending]
why_human: GUI host config placement, variable interpolation, and startup behaviour are invisible from a headless sandbox. Needs ~45-60 minutes across the three hosts; a failing host blocks the release.

### 3. Cut `0.2.0` only after sign-off
expected: `npm version 0.2.0` then push `v0.2.0` → `package.json` and `package-lock.json` both `0.2.0`, tag equals version, publish job moves `latest`.
prerequisite: test 2 sign-off.
result: [pending]
why_human: milestone gate (D-06/D-20/D-26) — must not move `latest` before host validation passes.

### 4. Decide the publish-trigger hardening
expected: the `workflow_dispatch`-on-tag hole stays closed — `if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')` (already fixed in `5a8d8d7`); confirm this hardening is accepted as-is.
result: [pending]
why_human: policy call on the recorded must-have wording (verifier flipped must-have #25 to VERIFIED; 30/32).

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

- Reorder note: the session was written publish-last; it is now publish-first because tests 1 and 2 read the package from the registry and cannot run before it exists.
- No `v0.2.0` tag exists locally or on GitHub; `@zandev32/pioneer` returns 404 from the registry; no `next` dist-tag exists; `latest` has not moved.
- Phase 03 cannot be marked complete until tests 1-3 pass.
