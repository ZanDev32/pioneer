# Host Smoke Test — milestone gate

Manual validation of a published build inside the real MCP hosts. Automation cannot
observe config file placement, `${workspaceFolder}` / environment interpolation, or GUI
startup behaviour, so this checklist is **gated to milestone releases only** (`v0.2.0` and
`v1.0.0`) — not to ordinary patch releases.

**Gate contract (D-20 / D-06 / D-26):**

- Every host below must pass against the **release candidate** before `latest` moves.
- The candidate is published under the `next` dist-tag. `latest` is only ever served by a
  fresh `0.2.0` published through the same pipeline; a dist-tag is never moved by hand.
- Record the outcome in the [sign-off table](#sign-off) at the bottom. A single failing
  host blocks the final release — stop and report the host, do not edit the dist-tags.

## How to run the candidate

Install the candidate exactly as the pipeline published it:

```bash
npx -y @zandev32/pioneer@next
```

The `@next` tag pin is the **single sanctioned delta** from the config blocks in
`test/fixtures/host-configs/` and from `README.md`. Those keep the bare
`npx -y @zandev32/pioneer` (fixtures) and `npx @zandev32/pioneer` (README), which are the
canonical forms once `0.2.0` is `latest`; before the first publish the bare spec resolves
no artifact at all. Change **only** the package spec — every other key (`mcpServers` /
`servers`, `type`, `command`, `-y`, `--workspace`, `cwd`, `env`) is copied byte for byte
from the fixture block, so the text validated here is the text CI checks.

Before touching a host, confirm the registry state:

```bash
npm view @zandev32/pioneer@next version    # -> 0.2.0-rc.1
npm view @zandev32/pioneer dist-tags --json # -> {"next":"0.2.0-rc.1"} only
```

### Preflight (all hosts)

- [ ] Node.js `>= 22.12.0` on `PATH` (`node -v`).
- [ ] PlatformIO Core on `PATH` (`pio --version`).
- [ ] A real PlatformIO project with `platformio.ini`, a single `[env:*]` you care about,
      and a source tree that already builds once from a terminal (`pio run` exits 0).
      No sample project: the check is that the *host* resolves *your* project.
- [ ] Note the absolute project path; it replaces `/absolute/path/to/project` below.

## Claude Desktop

Config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Paste this block (package spec pinned to `@next`; `type` is omitted because Claude Desktop
rejects an unknown `type` field):

```json
{
  "mcpServers": {
    "pioneer": {
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer@next", "--workspace", "/absolute/path/to/project"],
      "env": {
        "PIO_WORKSPACE_ROOT": "/absolute/path/to/project"
      }
    }
  }
}
```

Reload: quit Claude Desktop completely (tray → Quit, not just close the window) and start
it again.

Checks:

1. The server `pioneer` appears in the host's MCP / connectors list with no error badge.
2. The tools list renders **12** tools: `pio_build`, `pio_check`, `pio_clean`,
   `pio_list_boards`, `pio_list_devices`, `pio_run_tests`, `pio_serial_read`,
   `pio_serial_start`, `pio_serial_stop`, `pio_task_list`, `pio_task_status`, `pio_upload`.
3. `pio_list_devices` returns without error (an empty device list is a pass; a spawn or
   connection failure is not).
4. `pio_build` on the real project returns structured JSON — `success`, `exit_code`,
   `diagnostics`, `summary`, `metadata` (and a `task_id` when run in the background). The
   `metadata` environment matches the project you configured.
5. Workspace resolution: the build acts on the intended project — `metadata` / log paths
   point into that directory and no `platformio.ini`-missing error appears. With both
   `--workspace` and `PIO_WORKSPACE_ROOT` set to the same path, either resolving correctly
   is a pass.

## Cursor

Config file: `~/.cursor/mcp.json` for all projects, or `.cursor/mcp.json` inside one
project. On Windows the global file is `%USERPROFILE%\.cursor\mcp.json`.

Paste this block:

```json
{
  "mcpServers": {
    "pioneer": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer@next", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

Reload: command palette → `Developer: Reload Window` (or restart Cursor for the global
file).

Checks:

1. `pioneer` appears under Settings → MCP with a green / connected state.
2. The tools list renders the same **12** tools as listed for Claude Desktop.
3. `pio_list_devices` returns without error.
4. `pio_build` returns structured JSON with a non-zero-free `exit_code` and a `summary`
   that is not `no diagnostics` unless the project genuinely builds clean.
5. Workspace resolution: `${workspaceFolder}` must expand to the open project — confirm
   the build metadata names that project's environment, not a parent directory or the
   user's home. If it does not expand, replace it with the literal absolute path and
   record the host-specific note.

## VS Code

Config file: `.vscode/mcp.json` in the workspace, or the `mcp.json` of your VS Code
profile — `~/.config/Code/User/mcp.json` (Linux),
`~/Library/Application Support/Code/User/mcp.json` (macOS),
`%APPDATA%\Code\User\mcp.json` (Windows).

Paste this block (note the `servers` key and the explicit `cwd`):

```json
{
  "servers": {
    "pioneer": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer@next", "--workspace", "${workspaceFolder}"],
      "cwd": "${workspaceFolder}",
      "env": {
        "PIO_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

Reload: command palette → `MCP: List Servers` → restart `pioneer`, or
`Developer: Reload Window`.

Checks:

1. `pioneer` is listed and running in `MCP: List Servers`.
2. The tools list renders the same **12** tools as listed for Claude Desktop.
3. `pio_list_devices` returns without error.
4. `pio_build` returns structured JSON with `success`, `exit_code`, `diagnostics`,
   `summary`, `metadata`.
5. Workspace resolution: VS Code does not advertise MCP roots, so the workspace has to
   come from `--workspace` or `PIO_WORKSPACE_ROOT` — confirm the build metadata names the
   open project's environment. See [VS Code workspaces that do not advertise MCP
   roots](#vs-code-workspaces-that-do-not-advertise-mcp-roots).

## Windows: the `npx` case

`command: "npx"` fails on hosts that spawn the command without a shell — Windows resolves
executables through `PATHEXT` and needs the `.cmd` shim.

1. If the server fails to start on Windows with a spawn / `ENOENT` error, change only
   `"command"` to `"npx.cmd"` (or the absolute path to `npx.cmd`) and reload.
2. `-y` must stay in `args` — without it the first launch hangs on
   `Ok to proceed? (y)` and the host reports a startup timeout.
3. Backslashes in the JSON path must be escaped (`C:\\Users\\you\\project`), or use forward
   slashes (`C:/Users/you/project`).
4. `pio_serial_start` is POSIX-only. On Windows it must return the structured error
   `PLATFORM_UNSUPPORTED` (code `-32010`, naming the stty/cat constraint and the WSL
   alternative). A hang, a crash, or a generic spawn error is a **fail**; run the server
   under WSL instead.
5. `pio_build`, `pio_list_devices`, and `pio_upload` must still work natively on Windows.

## VS Code workspaces that do not advertise MCP roots

VS Code does not pass MCP roots to the server, so `${workspaceFolder}` may arrive
unsubstituted depending on the workspace type (single folder, multi-root, remote / WSL /
dev container).

1. Run `pio_list_boards` or `pio_build` and inspect the result for a
   "no `platformio.ini`" / workspace-path error.
2. If the path is wrong, replace every `${workspaceFolder}` in `--workspace`, `cwd`, and
   `env.PIO_WORKSPACE_ROOT` with the literal absolute project path, then reload.
3. Record which form was needed (substituted `${workspaceFolder}` vs literal path) in the
   notes — that is the whole point of this section.

## Sign-off

Fill one row per host. `Result` is `PASS` or `FAIL`; a `FAIL` includes the failing check
number and the error text verbatim.

| Date | Host | Host version | OS | RC version | Result | Check that failed | Notes |
| ---- | ---- | ------------ | -- | ---------- | ------ | ----------------- | ----- |
|      | Claude Desktop |      |    | 0.2.0-rc.1 |        |                   |       |
|      | Cursor         |      |    | 0.2.0-rc.1 |        |                   |       |
|      | VS Code        |      |    | 0.2.0-rc.1 |        |                   |       |

Per-host recording fields: date, host and version, OS, the RC version reported by
`npm view @zandev32/pioneer@next version`, result, failing check number, and notes (config
path used, whether `${workspaceFolder}` expanded, Windows `npx.cmd` needed or not).

Only after all three rows read `PASS` does the release continue: `npm version 0.2.0` writes
the version and creates the `v0.2.0` tag in one commit, and pushing that tag is what
publishes `latest`.
