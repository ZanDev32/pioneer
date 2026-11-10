# Phase 3: Distribution & Testing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 03-distribution-testing
**Areas discussed:** Package naming & publishing, Test framework & strategy, CI/CD pipeline design, MCP host integration testing, Versioning & release strategy, Test structure & organization, npm publish workflow details

---

## Package Naming & Publishing

| Option | Description | Selected |
|--------|-------------|----------|
| @pioarduino/mcp-server (clean rename) | Scoped, single bin "mcp-server", aligns with MCP ecosystem and Phase 1 spec | |
| @pioarduino/mcp-server + pioneer alias | Scoped + backward-compatible dual bin | |
| Keep pioneer (unscoped) | Zero changes, risk of npm name collision | |
| @pioarduino/pioneer (scoped brand) | Scoped, minimal changes, doesn't match spec | |
| @ZanDev32/pioneer | User's personal scoped package — freeform input | ✓ |

**User's choice:** `@ZanDev32/pioneer` — scoped under the user's personal npm org `@ZanDev32`, keeping the "pioneer" brand with bin entry `pioneer`.
**Notes:** Only package.json `"name"` field and README references need updating. Phase 1 D-02 auto-install reference updates to `npx @ZanDev32/pioneer`.

---

## Test Framework & Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Jest 29 (keep as-is) | Already configured, mock child_process.exec, zero migration cost | |
| Vitest (migrate from Jest) | Native ESM, 2-3× faster, same esbuild toolchain as build.mjs | ✓ |
| Jest + PIO output fixtures | Add fixture-recorded output for deterministic tests | |
| Jest now, Vitest as fallback | Start with Jest, upgrade if --experimental-vm-modules flakes | |

**User's choice:** Vitest — migrate from Jest 29 for native ESM support and faster CI startup.
**Notes:** Jest-compatible API (`describe`/`it`/`expect`) makes migration straightforward. No `--experimental-vm-modules` flag needed.

---

## CI/CD Pipeline Design

| Option | Description | Selected |
|--------|-------------|----------|
| Standard Split (ci.yml + publish.yml) | Separate CI and publish workflows, clean badge semantics | |
| Single file + tag trigger | Minimal setup, git tag v* to release, simpler mental model | ✓ |
| Standard Split, lean matrix | Split workflows, PIO integration tests only on ubuntu-latest | |

**User's choice:** Single file + tag trigger — minimal setup, `git tag v*` to release.
**Notes:** Simpler mental model for solo maintainer. Matrix: ubuntu/macos/windows × Node 18/20/22. PIO integration on ubuntu-latest only.

---

## MCP Host Integration Testing

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: Inspector CLI + checklists | MCP Inspector in CI for protocol, manual checklists at milestones | |
| Inspector CLI only | Automated protocol compliance only, skip manual checklists | |
| Manual checklists only | No CI automation for host testing | |
| Full: CLI + templates + checklists | Inspector CLI + config template validation + milestone checklists | ✓ |

**User's choice:** Full coverage — MCP Inspector CLI automation + config file template validation + milestone-gated manual smoke test checklists.
**Notes:** Inspector CLI validates JSON-RPC protocol and all 12 tools in CI. Config template validation catches key name drift between Claude Desktop, Cursor, VS Code. Manual checklists gated to milestone releases for host-specific quirks.

---

## Versioning & Release Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Manual semver + changelog | npm version + CHANGELOG.md, zero deps, full control | ✓ |
| Conventional commits + standard-version | Semi-automated, generates changelog from commits | |
| npm version only, skip changelog | Minimal, no changelog maintenance | |

**User's choice:** Manual semver + Keep a Changelog (`CHANGELOG.md`). Zero tooling dependencies.
**Notes:** First scoped publish at `0.2.0` (bump from `0.1.0` to signal rename). `npm version patch/minor/major` creates git tag + commit.

### Pre-release Strategy (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Full pre-release ladder | alpha → beta → rc → stable | |
| Single release candidate | 0.2.0-rc.1 → 0.2.0 | ✓ |
| No pre-release, ship directly | 0.2.0 directly | |

**User's choice:** Single release candidate (`0.2.0-rc.1` → `0.2.0`). Validate across MCP hosts once before tagging `latest`.

---

## Test Structure & Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: unit/ + integration/ | test/unit/ for pure functions, test/integration/ for tool handlers, Vitest workspaces | ✓ |
| Flat test/ directory | Single directory, simpler config, naming convention for unit vs integration | |
| Hybrid + inline fixtures | Hybrid layout with inline string fixtures for parsers | |

**User's choice:** Hybrid `test/unit/` + `test/integration/` layout with Vitest workspaces for different timeouts.
**Notes:** Unit tests for parsers/errors/metadata (pure functions). Integration tests for tool handlers (mocked `runPioCommand`). Build order: parsers → errors → utils → TaskManager → tool handlers.

---

## npm Publish Workflow Details

| Option | Description | Selected |
|--------|-------------|----------|
| Git tag trigger + CI publish | CI triggers on git tag v*, pre-publish: ci → build → test, npm publish --provenance | ✓ |
| Tag trigger + publishConfig | Same as above + publishConfig.access: public in package.json | |
| GitHub Release trigger | Trigger on release: [published] event, GitHub Releases as source of truth | |

**User's choice:** Git tag trigger + CI publish. `npm ci → npm run build → npm test` safety gate before `npm publish --provenance`.
**Notes:** `--access public` on first publish (scoped package requirement). Granular npm token (`Automation` type), stored as `NPM_TOKEN` secret.

---

## the agent's Discretion

The following were left to the agent's discretion (documented in CONTEXT.md):
- Exact Vitest config file structure (`vitest.config.js` vs `vitest.workspace.js`)
- Specific test file naming convention under `test/unit/` and `test/integration/`
- Detailed GitHub Actions workflow YAML (job names, step ordering, badge URL)
- CHANGELOG.md format and initial content
- Whether to add `publishConfig.access: "public"` to package.json
- Token scope details for `NPM_TOKEN` (granular per-package)
- Exact mock setup boilerplate for `vi.mock` in tool handler tests
- Fixture file format and organization under `test/fixtures/`

## Deferred Ideas

None raised during this discussion. All user suggestions were within phase scope boundaries.

---

# Re-discussion 2026-11-09 — verification depth, release flow, install paths

> Triggered after the first plan set (5 plans) passed verification. The five areas below are
> things those plans asserted but the original discussion never decided. Decisions landed as
> D-21..D-27 in `03-CONTEXT.md`.

## Windows/macOS lane depth

| Option | Description | Selected |
|--------|-------------|----------|
| Unit-only on Windows/macOS | windows/macos run `npm run test:unit`; ubuntu runs full `npm test` | ✓ |
| Full suite on all three OS | every OS runs `npm test` | |
| Ubuntu-only | drop cross-OS build proof | |

**User's choice:** Unit-only on Windows/macOS.
**Notes:** D-14 already said "build + unit tests" on all OS while plan 03-05 ran bare `npm test` on all three — the conflict is now resolved in favour of D-14.

## POSIX-only serial monitor on Windows

| Option | Description | Selected |
|--------|-------------|----------|
| Assert a clear platform error | explicit `PioMcpError` on win32 + unit test | ✓ |
| Leave the raw spawn error | no guard, Windows user sees `ENOENT` | |

**User's choice:** Assert a clear platform error.

## Coverage policy

| Option | Description | Selected |
|--------|-------------|----------|
| Floor 70/60/70/70 | lighter global floor | |
| Floor 80/70/80/80 | statements/branches/functions/lines, enforced in CI | ✓ |
| Report-only | artifact, never fails | |

**User's choice:** Floor 80/70/80/80.
**Notes:** The floor was deliberately raised above the recommendation because Phase 3 writes the whole suite in one pass; per-file floor of 85% lines on `src/parsers.js` also selected (over a global-only rule).

## Default `npm test` composition

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude protocol from `npm test` | `npm test` = unit + integration; `test:protocol` separate | ✓ |
| Include protocol | one command proves everything, +build +12 stdio calls | |
| Unit-only default | split the rest into named scripts | |

**User's choice:** Exclude protocol from `npm test`.
**Notes:** Coverage measured from unit + integration only (over "all projects merged") because protocol tests exercise the bundle, not source.

## RC → `latest` promotion

| Option | Description | Selected |
|--------|-------------|----------|
| Republish 0.2.0 through the pipeline | fresh build + own attestation; RC stays under `next` | ✓ |
| Move `latest` with dist-tag add | no rebuild, `latest` would point at `-rc.1` | |

**User's choice:** Republish through the pipeline.
**Notes:** Publish trigger is a pushed `v*` tag only (no `workflow_dispatch` publishing path). Dist-tag is derived from semver — `-` in the version → `--tag next`, otherwise `latest`.

## Install paths (user-raised, free text)

| Option | Description | Selected |
|--------|-------------|----------|
| npx first, plus global + source | three documented paths; host fixtures use `npx -y`; unit test asserts README | ✓ |
| npx only | shortest docs, `bin: pioneer` undocumented | |
| Three paths + post-publish npx smoke job | adds a dispatch-only CI job proving the tarball launches | |

**User's choice:** npx first, plus global + source.
**Notes:** User raised this as free text during the finalize checkpoint: "add option to be install using npx". Recorded as D-27.
