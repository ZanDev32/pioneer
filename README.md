# Pioneer

Standalone MCP (Model Context Protocol) server for PlatformIO/pioarduino projects. Build, upload, and clean firmware projects through structured AI agent tools.

## Installation

```bash
npm install
```

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

## Adding to VS Code as a Remote MCP

### Option 1: HTTP Mode (Recommended for Remote)

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

### Option 2: Stdio Mode (Local Projects)

For projects in your current workspace, use stdio mode in `.vscode/mcp.json`:
```json
{
  "servers": {
    "pioneer": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/pioneer/dist/server.js",
        "--workspace",
        "${workspaceFolder}"
      ]
    }
  }
}
```

> **Note**: `command` must be an absolute path or a globally installed binary. Using `node dist/server.js` with a relative path won't work — resolve it to the full path.

### Option 3: Global Install

```bash
cd /path/to/pioneer && npm install -g .
```

Then reference it in `.vscode/mcp.json`:
```json
{
  "servers": {
    "pioneer": {
      "type": "stdio",
      "command": "pioneer",
      "args": ["--workspace", "${workspaceFolder}"]
    }
  }
}
```

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
