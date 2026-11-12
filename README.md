# Pioneer

Standalone MCP (Model Context Protocol) server for PlatformIO/pioarduino projects. Build, upload, and clean firmware projects through structured AI agent tools.

## Installation

Requires Node.js >= 22.12.0 and PlatformIO Core (`pio`) on `PATH`. Three install paths, least commitment first — all of them run the same `@zandev32/pioneer` package.

### Zero-Install

Run straight from the npm registry without adding anything globally:

```bash
npx @zandev32/pioneer --workspace /path/to/pio/project
```

Add `-y` in host configs and scripts so npm never stops to ask `Ok to proceed? (y)`:

```bash
npx -y @zandev32/pioneer --workspace /path/to/pio/project
```

### Global Install

```bash
npm i -g @zandev32/pioneer
pioneer --workspace /path/to/pio/project
```

### Clone and Build (Contributors)

From a clone of this repository:

```bash
npm ci
npm run build
node dist/server.js --workspace /path/to/pio/project
```

Release history lives in [CHANGELOG.md](CHANGELOG.md).

## Usage

### Stdio Mode (Default)

For AI hosts that connect via stdio transport (Claude Desktop, Cursor, VS Code):

```bash
pioneer
# or
node dist/server.js
```

### HTTP Mode

For remote MCP clients (VS Code, Cursor, etc.):

```bash
pioneer --port 3000
# or
PORT=3000 pioneer
# or with a specific workspace
pioneer --port 3000 --workspace /path/to/pio/project
```

## Host Configuration

Every block below launches `npx -y @zandev32/pioneer` over stdio. Replace `/absolute/path/to/project` with the absolute path to your PlatformIO project.

### Claude Desktop

Config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pioneer": {
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer", "--workspace", "/absolute/path/to/project"],
      "env": {
        "PIO_WORKSPACE_ROOT": "/absolute/path/to/project"
      }
    }
  }
}
```

Claude Desktop rejects an unknown `type` field, so it is omitted.

### Cursor

Config file: `~/.cursor/mcp.json` for all projects, or `.cursor/mcp.json` inside one project.

```json
{
  "mcpServers": {
    "pioneer": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

### VS Code

Config file: `.vscode/mcp.json` in the workspace, or the `mcp.json` of your VS Code profile.

```json
{
  "servers": {
    "pioneer": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@zandev32/pioneer", "--workspace", "${workspaceFolder}"],
      "cwd": "${workspaceFolder}",
      "env": {
        "PIO_WORKSPACE_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

VS Code does not advertise MCP roots, so the workspace has to come from `--workspace` or `PIO_WORKSPACE_ROOT` — both are set above.

## Adding to VS Code as a Remote MCP

### HTTP Mode (Recommended for Remote)

1. **Start the MCP server** on a port:
   ```bash
   pioneer --port 3000 --workspace /path/to/pio/project
   ```

2. **Configure VS Code** in your workspace `.vscode/mcp.json` (or user settings):
   ```json
   {
     "servers": {
       "pioneer": {
         "type": "http",
         "url": "http://localhost:3000"
       }
     }
   }
   ```

3. **Restart VS Code** — the Pioneer tools will appear in the Copilot chat.

For local (stdio) projects see [VS Code](#vs-code) under Host Configuration.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PIO_WORKSPACE_ROOT` | Path to the PlatformIO project workspace root |
| `PORT` | Alternative way to set HTTP port |

## MCP Tools

### `pio_build`

Build a PlatformIO project for a specified environment. Returns structured diagnostics (16x token reduction vs raw logs).

**Parameters:**
- `project_dir` (optional) — Path to the PIO project
- `environment` (optional) — Build environment (e.g., `esp32dev`)
- `verbose` (optional) — Include full build output
- `build_only` (optional) — Generate compile_commands.json only
- `incremental` (optional) — Only show diagnostics for modified files

### `pio_upload`

Upload firmware to a connected device. Returns upload status with diagnostics.

**Parameters:**
- `project_dir` (optional) — Path to the PIO project
- `environment` (optional) — Build environment
- `port` (optional) — Serial port (auto-detected if omitted)
- `verbose` (optional) — Include full output

### `pio_clean`

Clean build artifacts for a specific environment.

**Parameters:**
- `project_dir` (optional) — Path to the PIO project
- `environment` (required) — Environment to clean
- `verbose` (optional) — Include full output

## Architecture

This server uses a standalone execution model — `pio run` commands are executed via `child_process.exec`, making it portable across any environment with PlatformIO Core installed.

## Development

```bash
# Build
npm run build

# Start (dev)
node dist/server.js

# Test
npm test
```

## License

Apache-2.0
