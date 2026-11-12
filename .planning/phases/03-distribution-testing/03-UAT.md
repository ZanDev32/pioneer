---
status: testing
phase: 03-Distribution & Testing
source: [03-VERIFICATION.md]
started: 2026-11-12T07:48:00Z
updated: 2026-11-13T01:40:00Z
order: dependency-ordered (publish -> host validation -> release cut -> hardening), reordered by user request
---

## Current Test

number: 2
name: Three-host RC validation — Claude Desktop, Cursor, VS Code
expected: |
  Following docs/host-smoke-test.md with `npx -y @zandev32/pioneer@next`
  (= 0.2.0-rc.3): in each host the config is placed where that host reads it,
  `${workspaceFolder}` / `PIO_WORKSPACE_ROOT` resolve, the server starts and
  `tools/list` returns 12 tools, and a build completes. All three sign-off rows
  read PASS.
awaiting: user response

## Tests

### 1. Publish the release candidate under `next`
expected: `npm view @zandev32/pioneer dist-tags --json` → `next` only, no `latest`; `npx -y @zandev32/pioneer@next --help` prints the published version.
prerequisite: the `NPM_TOKEN` repository secret (granular token with bypass-2FA) — now present and working.
result: fail
observed: |
  Three RC publishes succeeded: 0.2.0-rc.1 (run 43264560055), 0.2.0-rc.2 (43265188947),
  0.2.0-rc.3 (43267265226). Each logged `+ @zandev32/pioneer@0.2.0-rc.X` plus a provenance
  attestation; the registry became readable only after npm's first-publish processing window
  (~5-10 min), which is why early `npm view` calls 404'd.
  WORKS: `npx -y @zandev32/pioneer@next --help` -> "Pioneer v0.2.0-rc.3";
  `npx -y @zandev32/pioneer@0.2.0-rc.1 --help` -> "Pioneer v0.2.0-rc.1" (bin present in the
  published package; the local `bin[pioneer] ... removed` warning was npm normalizing `./`, not
  a broken artifact). rc.2 fixed `bin` and `repository.url` to npm's normalized forms.
  FAILING CRITERION: `npm view @zandev32/pioneer dist-tags --json` ->
  {"latest":"0.2.0-rc.1","next":"0.2.0-rc.3"}. npm stamps `latest` on a brand-new package even
  when publishing with `--tag next`, so a prerelease is the default install target and the
  D-06/D-20/D-26 gate ("`latest` has not moved") is violated.
cause: |
  1. npm first-publish default (not a workflow bug) - now guarded: the publish job removes
     `latest` when it points at a prerelease (commit 67b65ff).
  2. The guard cannot execute the cleanup: NODE_AUTH_TOKEN can publish but
     `DELETE /-/package/@zandev32%2fpioneer/dist-tags/latest` returns 403, so the step now warns
     instead of failing the release (commit 6d00932). Removing the tag needs npm-side authority
     (a token allowed to manage dist-tags, or an interactive OTP).
resolution_path: `npm dist-tag rm @zandev32/pioneer latest` with sufficient authority; it also
  self-heals when 0.2.0 publishes (a plain version sets `latest` correctly).

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
