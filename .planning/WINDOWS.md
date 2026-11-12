---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-11-12T06:00:01.629Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 03 | deviation | package.json |  | D-14 amended: engines.node >=22.12.0; vitest 5.1.0 instead of 3.2.7 (human-approved) | open |  | 2026-11-12T06:00:01.356Z |  |
| 2 | 03 | deviation | package.json |  | esbuild bumped ^0.25.0 -> ^0.28.2 for vite 8 peer of vitest 5.1.0 | open |  | 2026-11-12T06:00:01.629Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "03",
    "file": "package.json",
    "line": null,
    "description": "D-14 amended: engines.node >=22.12.0; vitest 5.1.0 instead of 3.2.7 (human-approved)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-12T06:00:01.356Z",
    "resolved_at": null,
    "milestone": "v1.0"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "03",
    "file": "package.json",
    "line": null,
    "description": "esbuild bumped ^0.25.0 -> ^0.28.2 for vite 8 peer of vitest 5.1.0",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-12T06:00:01.629Z",
    "resolved_at": null,
    "milestone": "v1.0"
  }
]
````
