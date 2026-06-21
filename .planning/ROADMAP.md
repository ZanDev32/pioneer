# Roadmap: pioarduino MCP Server

## Phase 0: Standalone Server Extraction ✅ COMPLETED
**Goal:** Extract MCP server from VS Code extension into standalone package

### Plans
1. **Server entry point** - Create src/server.js with stdio transport, CLI args parsing, tool registration
2. **Error taxonomy** - Port errors.js with all error codes, validation helpers
3. **Diagnostic parsers** - Port parsers.js (GCC, linker, Python, CMake, multi-line notes)
4. **Build metadata** - Port metadata.js (duration, RAM/flash usage, binary size, incremental filtering)
5. **Build tool** - Port build.js with child_process.exec instead of pioarduino-node-helpers
6. **Upload tool** - Port upload.js (no IPC coordination in standalone)
7. **Clean tool** - Port clean.js (per-environment, bytes_freed tracking)
8. **Build script** - esbuild bundle to single dist/server.js file
9. **Package config** - package.json with dependencies, bin entry, scripts
10. **README** - Usage documentation with examples

## Phase 1: Agent Skills Layer ✅ COMPLETED
**Goal:** Create SKILL.md instruction layer for safe agent interactions

### Plans
1. **Mega-skill SKILL.md** - 3-tier execution hierarchy (MCP → Auto-install → CLI fallback)
2. **Tool reference guide** - Complete parameter reference for each MCP tool
3. **ESP32 troubleshooting** - Port drift, DTR/RTS overrides, flash corruption recovery
4. **Fallback scripts** - Shell wrappers (build.sh, upload.sh, clean.sh, monitor.sh)
5. **Safety guidelines** - Ask before flash, environment safety, port discovery first

## Phase 2: Tool Expansion
**Goal:** Add discovery, monitoring, and advanced tools

### Plans
1. **pio_list_boards** - List available boards from platformio.ini environments
2. **pio_list_devices** - List connected serial devices (serialport library)
3. **Background tasks** - taskId polling for long-running builds/uploads
4. **pio_check** - Static analysis integration (clang-tidy)
5. **pio_run_tests** - Unit test execution (pio test)
6. **Serial monitor** - Start/stop/query serial monitor with log spooling

## Phase 3: Distribution & Testing
**Goal:** Package for npm, test with multiple AI hosts

### Plans
1. **NPM package** - @pioarduino/mcp-server publish setup
2. **Claude Desktop config** - Test MCP server configuration
3. **Cursor integration** - Test with Cursor MCP setup
4. **VS Code mcp.json** - Standalone mode for extension-less usage
5. **Test suite** - Port 233 tests from extension repo, add standalone-specific tests
6. **CI/CD** - GitHub Actions for build + test pipeline

## Phase 4: Competitive Features
**Goal:** Match and exceed jl-codes/platformio-mcp feature set

### Plans
1. **Library management** - Search, install, uninstall, update libraries
2. **Project initialization** - pio init from template
3. **Policy profiles** - Safety profiles for different risk levels
4. **Board intelligence** - Auto-detect board specs, recommend settings
5. **Dashboard integration** - Web dashboard for monitoring (like competitor)
6. **Multi-project support** - Handle multiple PIO projects simultaneously

## Out of Scope
- VS Code extension integration (handled by parent repo)
- IPC coordination with extension host (extension-specific)
- HTTP transport (MCP SDK unstable, future consideration)
- Hardware locking/queue management (extension-only feature)

## Dependencies
- PlatformIO Core (`pio` CLI) must be installed on host system
- Node.js 18+ runtime
- MCP SDK (@modelcontextprotocol/sdk ^1.12.1)
- Zod for parameter validation
- esbuild for bundling
- (Future) serialport for device enumeration
