# pioarduino MCP Server

Standalone MCP (Model Context Protocol) server for PlatformIO/pioarduino projects. Build, upload, and clean firmware projects through structured AI agent tools.

## Installation

```bash
npm install
```

## Usage

### Stdio Mode (Default)

For AI hosts that connect via stdio transport (Claude Desktop, Cursor, VS Code):

```bash
pioarduino-mcp-server
# or
node dist/server.js
```

### HTTP Mode

For remote MCP clients:

```bash
pioarduino-mcp-server --port 3000
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
