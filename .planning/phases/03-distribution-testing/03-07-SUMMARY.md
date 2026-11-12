---
phase: 03-distribution-testing
plan: 07
subsystem: ci-release
tags: [ci, publish, provenance, npm, github-actions]
requires:
  - "03-06: ci.yml with push tags ['v*'], test/protocol/e2e jobs"
provides:
  - "Tag-triggered npm publish job with provenance, tag/version guard, and prerelease dist-tag"
affects:
  - ".github/workflows/ci.yml"
tech-stack:
  added: []
  patterns:
    - "OIDC provenance publish: permissions contents:read + id-token:write, npm publish --provenance"
key-files:
  created: []
  modified:
    - ".github/workflows/ci.yml"
decisions:
  - "Publish job gated by startsWith(github.ref, 'refs/tags/v') alone — no workflow_dispatch path, so it cannot run from a PR or manual dispatch"
  - "dist-tag derived from package version: hyphen -> --tag next, otherwise npm's default latest"
  - "NPM_TOKEN reaches the job only via NODE_AUTH_TOKEN on the single publish step's env"
metrics:
  duration: "~6 min"
  completed: "2026-11-12"
  tasks: 2
  files: 1
status: complete
actuals:
  tokens: 400
  tasks: 2
  commits: 2
---

# Phase 3 Plan 7: Tag-triggered provenance publish Summary

`publish` job added to `.github/workflows/ci.yml`: fires only on a pushed `v*` tag, asserts the tag equals the `package.json` version before `npm publish --provenance`, and derives `--tag next` for hyphenated versions. Repo creation and `origin` wiring (plan task 3) are left to the orchestrator post-merge.

## What Changed

`.github/workflows/ci.yml` — one new `publish` job appended after `e2e`:

| Step | Purpose |
|---|---|
| checkout@v7 | source |
| setup-node@v7 (node 24, `registry-url`, `package-manager-cache: false`) | registry auth file, no stale dep cache |
| `npm ci` / `npm run build` / `npm test` | prove the artifact before publishing |
| `Check tag matches package version` | `test "${GITHUB_REF_NAME#v}" = "$(npm pkg get version \| tr -d '"')"` — fails before publish on drift |
| `Derive dist-tag` | `flag=--tag next` when version contains `-`, else empty |
| `Publish to npm` | `npm publish --provenance --access public ${{ steps.dist_tag.outputs.flag }}`, `NODE_AUTH_TOKEN` on this step only |

The existing `on:` block was not touched — `push.tags: ['v*']` was already declared by 03-06.

## Acceptance Evidence

### 1. YAML parse + structural facts

`python3 -c` load of `.github/workflows/ci.yml`:

```
jobs: ['test', 'protocol', 'e2e', 'publish']
if: startsWith(github.ref, 'refs/tags/v')
permissions: {'contents': 'read', 'id-token': 'write'}
npm publish occurrences: 1
continue-on-error in publish job: False
NPM_TOKEN occurrences in file: 1
publish steps with env: [('Publish to npm', {'NODE_AUTH_TOKEN': '${{ secrets.NPM_TOKEN }}'})]
publish step env keys: [{'NODE_AUTH_TOKEN': '${{ secrets.NPM_TOKEN }}'}]
```

Plan's own automated verifies:

```
verify1 OK   # publish job present, id-token: write, npm publish --provenance, startsWith(github.ref,
verify2 OK   # GITHUB_REF_NAME#v exactly once, --tag next present
verify3 OK   # exactly 1 publish step, no continue-on-error, no retry action
```

Forbidden-pattern scan over the whole workflow:

```
none of sudo/$HOME/absolute-home/continue-on-error/retry present
```

### 2. Unreachable from PR / workflow_dispatch

The publish job's sole gate is:

```yaml
if: startsWith(github.ref, 'refs/tags/v')
```

`pull_request` sets `github.ref` to `refs/pull/<n>/merge` and `workflow_dispatch` on master to `refs/heads/master` — neither matches, so the job is skipped. There is no second trigger or dispatch input that can reach it.

### 3. Suites still green after the edit

```
npm test
 Test Files  16 passed (16)
      Tests  142 passed (142)

npm run test:protocol
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

(`npm run build` succeeded first: `Built dist/server.js successfully`.)

## Deviations from Plan

**1. [Assignment constraint] Plan task 3 (create public repo + `origin`) not executed**
- **Found during:** Task 3
- **Issue:** The worktree assignment forbids touching remotes, creating the GitHub repo, or pushing; those are parent-checkout operations after merge.
- **Fix:** Recorded the exact commands and the human `NPM_TOKEN` action under "Post-merge orchestrator actions" below.
- **Files modified:** none
- **Commit:** n/a

Task 1's `checkpoint:human-verify` (npm scope, public repo, publish token) was pre-answered "approve all three" by the orchestrator, so execution did not halt there.

No Rule 1–4 auto-fixes were needed; the workflow-only diff introduced no bugs.

## Known Stubs

None.

## Threat Flags

None — the new surface (OIDC publish) is the one the plan's threat model already covers (T-3-08 and the tag→registry boundary).

## Post-merge orchestrator actions

The orchestrator runs these in the parent checkout after merging this patch. Nothing below has been executed.

```bash
# 1. Create the public repo, set origin, push master + tags.
#    --source=. --remote=origin --push does repo creation, remote add, and initial push in one step.
gh repo create ZanDev32/pioneer --public --source=. --remote=origin --push
git push origin --tags

# 2. Confirm origin and repository.url match case-sensitively (provenance requirement).
git ls-remote --get-url origin   # expect https://github.com/ZanDev32/pioneer
```

Human action (not automatable): create the `NPM_TOKEN` repository secret at
`github.com/ZanDev32/pioneer -> Settings -> Secrets and variables -> Actions` using a
granular Automation token with publish rights for the `@zandev32` scope
(`npmjs.com -> Access Tokens -> Generate New Token`). Do not print the token into a
shell, a workflow log, or any file.

**No publish has occurred.** The `publish` job has never run — it requires a pushed `v*`
tag, the `NPM_TOKEN` secret, and a matching `package.json` version. Version is still
`0.1.0` and was not bumped.

## Self-Check: PASSED

- `.github/workflows/ci.yml` modified (44 insertions), commit `c7676f1`
- `03-07-SUMMARY.md` written
