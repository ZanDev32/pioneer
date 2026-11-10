---
phase: "3"
slug: "distribution-testing"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-09"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.7 + `@vitest/coverage-v8` 3.2.7 (pinned: Vitest 5.1.0 requires Node ≥22.12 and D-14's matrix includes Node 18) |
| **Config file** | `vitest.config.js` — none exists, Wave 0 creates it |
| **Quick run command** | `npx vitest run --project unit` |
| **Full suite command** | `npm test` → `vitest run` (**unit + integration only**, D-25 — no build step). Protocol lane is separate: `npm run test:protocol` (build + stdio `tools/list`/`tools/call`, 03-06) |
| **Estimated runtime** | ~25 seconds (`npm test`: unit ~5s, integration ~20s); protocol lane adds ~10s on top |

---

## Sampling Rate

- **After every task commit:** `npx vitest run --project unit`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green; `npm pack --dry-run --json` must list only `dist/` + package metadata
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

Task IDs are assigned when PLAN.md files are created (plans do not exist yet). This map binds each
locked decision to its verification level so the planner can lift the right `<automated>` command
per task; the executor fills the Task/Plan/Wave columns.

| Decision / Req | Wave | Secure Behavior / Threat Ref | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|
| D-01 / D-01a (scoped lowercase name, `bin.pioneer`) | 1 | — | unit | `node -e "const p=require('./package.json');if(p.name!=='@zandev32/pioneer'||!p.bin.pioneer)process.exit(1)"` | ❌ W0 | ⬜ pending |
| D-04 / D-04a (`files` allowlist) | 1 | — | unit | `npm pack --dry-run --json \| node -e "…assert every entry starts with dist/ or is package metadata"` | ❌ W0 | ⬜ pending |
| D-07 (Vitest, no ESM flag) | 1 | — | unit | `npm test` exits 0 with `vitest` in the script and no `--experimental-vm-modules` | ❌ W0 | ⬜ pending |
| D-08 (no ported-repo mocks) | 1 | — | unit | `grep -rnE "(from\|import\|require\|mock)[[:space:]]*\(?[[:space:]]*['\"]vscode['\"]" test/ \| wc -l` returns 0 — module specifiers only; host-name fixtures (`test/fixtures/host-configs/vscode.json`) are not mocks | ❌ W0 | ⬜ pending |
| D-09 (single mock seam) | 1 | T-3-01: mock intercepts every `pio` invocation, so no handler test spawns a real CLI | integration | `npx vitest run --project integration` with no `pio` on PATH | ❌ W0 | ⬜ pending |
| D-11 (parsers/errors first) | 1 | — | unit | `npx vitest run test/unit/parsers.test.js test/unit/errors.test.js` | ❌ W0 | ⬜ pending |
| D-12 (hybrid layout, per-dir timeouts) | 1 | — | unit | `npx vitest run --project unit` and `--project integration` both resolve | ❌ W0 | ⬜ pending |
| D-18 (MCP Inspector protocol compliance) | 2 | T-3-02: Inspector runs with `--no-install` so CI cannot fetch an unpinned binary | protocol | `npx --yes @modelcontextprotocol/inspector@2.14.0 --cli … --method tools/list` reports 12 tools | ❌ W0 | ⬜ pending |
| D-19 (host config template validation) | 2 | — | unit | `grep -c "mcpServers" README.md` ≥ 3 and each host block names `npx` + `@zandev32/pioneer` | ❌ W0 | ⬜ pending |
| D-14 (CI matrix) | 3 | — | CI | workflow run on all three OS × Node 18/20/22 legs | ❌ W0 | ⬜ pending |
| D-03 / D-03a (tag publish + provenance) | 3 | T-3-03: publish job cannot run on `pull_request`; `id-token: write` scoped to the publish job only | manual / CI | `npm view @zandev32/pioneer dist.attestations` non-empty after RC publish | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.js` — workstation projects `unit` (2000ms) and `integration` (30000ms) per D-12
- [ ] `package.json` — remove `jest`, add `vitest` + `@vitest/coverage-v8` at 3.2.7; `test` script → `vitest run`
- [ ] `test/unit/`, `test/integration/`, `test/fixtures/` directories
- [ ] `CHANGELOG.md` seeded with `0.2.0-rc.1` (Keep a Changelog, D-05)
- [ ] `.github/workflows/ci.yml` skeleton with the D-14 matrix

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Server loads and all 12 tools are callable in Claude Desktop | D-20 | Requires the host GUI and its own config file location | Add the `mcpServers` block, restart the app, confirm the tool list renders and one `pio_list_devices` call returns |
| Same in Cursor (`.cursor/mcp.json`) | D-20 | Host GUI | Add the block, reload window, invoke `pio_list_devices` from the chat |
| Same in VS Code (`mcp.json`) standalone mode | D-20 | Host GUI | Add the block, run MCP: List Servers, confirm `pioneer` is connected |
| RC tag publishes under `next`, not `latest` | D-06 | Registry state after a real publish | `npm view @zandev32/pioneer dist-tags` shows `next: 0.2.0-rc.1` and `latest` unchanged |
| Provenance attestation present | D-03 | Only observable after a real publish | `npm view @zandev32/pioneer dist.attestations` is non-empty; the npmjs.com page shows the provenance badge |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
