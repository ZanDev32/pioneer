# Requirements: pioarduino MCP Server

## Table Stakes (Non-negotiable)

### TS-1: MCP Protocol Compliance
- Implements MCP 2024-11-05 spec
- StdioServerTransport for JSON-RPC over stdin/stdout
- All tools registered before transport connection
- Error responses follow JSON-RPC format with structured data

### TS-2: PlatformIO CLI Execution
- Executes `pio run` commands via child_process.exec
- Captures stdout + stderr separately, combines for parsing
- Handles non-zero exit codes gracefully
- Detects missing `pio` CLI in PATH
- Handles command timeouts with configurable limits

### TS-3: Project Validation
- Validates project_dir contains platformio.ini
- Validates environment exists in platformio.ini
- Workspace boundary checking (prevent arbitrary path access)
- Relative path resolution for diagnostics

### TS-4: Token-Efficient Diagnostics
- Parse GCC/Clang single-line diagnostics
- Parse linker errors (/usr/bin/ld, collect2)
- Parse Python script errors (ImportError, traceback)
- Parse IDF CMake errors
- Parse multi-line GCC notes
- Deduplicate diagnostics by file+line+message
- Summary string (e.g., "2 errors, 3 warnings")

### TS-5: Build Metadata Extraction
- Duration parsing ("Took X.XX seconds")
- RAM usage parsing (percentage + bytes)
- Flash usage parsing (percentage + bytes)
- Binary size detection (firmware.bin, firmware.elf)
- Incremental diagnostics filtering (mtime-based)

## Functional Requirements

### FR-1: pio_build Tool
- Parameters: project_dir (optional), environment (optional), verbose (optional), build_only (optional), incremental (optional)
- Returns: success, exit_code, diagnostics, summary, metadata
- Default environment: default_envs from platformio.ini
- build_only: generates compile_commands.json (compiledb target)

### FR-2: pio_upload Tool
- Parameters: project_dir (optional), environment (optional), port (optional), verbose (optional)
- Returns: success, exit_code, diagnostics, summary, metadata
- Auto-detects serial port if omitted
- Detects NO_DEVICE errors with structured response

### FR-3: pio_clean Tool
- Parameters: project_dir (optional), environment (required), verbose (optional)
- Returns: success, environment, bytes_freed
- Per-environment only (safe for multi-env projects)
- Calculates bytes freed (before/after comparison)

### FR-4: Error Taxonomy
- PROJECT_NOT_FOUND: No platformio.ini in path
- ENV_NOT_FOUND: Environment not in platformio.ini (includes available list)
- BUILD_FAILED: Non-zero exit from pio run
- UPLOAD_FAILED: Non-zero exit from pio run -t upload
- PIO_NOT_INSTALLED: pio CLI not in PATH
- PORT_BUSY: Serial port in use (future: IPC coordination)
- PROJECT_OUTSIDE_WORKSPACE: Path outside workspace boundary
- NO_DEVICE: No serial device found
- PIO_COMMAND_NOT_FOUND: 'pio' command not found

## Non-Functional Requirements

### NFR-1: Performance
- Server startup < 2 seconds
- Diagnostic parsing < 100ms for 50KB output
- Bundle size < 5MB (single file)
- Max buffer: 50MB for command output

### NFR-2: Portability
- Node.js 18+ (ESM)
- No external dependencies beyond MCP SDK + zod
- Works on Linux, macOS, Windows
- No filesystem access beyond project_dir and children

### NFR-3: Safety
- Environment validation before execution
- Workspace boundary enforcement
- No blind retries on failure
- Structured error responses (not raw stderr dumps)

## Phase 1 Requirements (Skills Layer)
- **SK-01:** SKILL.md mega-skill with 3-tier execution hierarchy (MCP → Auto-install → CLI fallback)
- **SK-02:** Safety guidelines for agent interactions (ask-before-flash, port discovery, workspace boundaries)
- **SK-03:** Fallback shell wrappers (Tier 3) — standalone scripts for build, upload, clean, monitor, discover, test
- **SK-04:** Troubleshooting reference docs covering port/connection, build/compile, ESP32 runtime, and library/platform issues

## Phase 2 Requirements (Tool Expansion)
- pio_list_boards: List available boards/environments
- pio_list_devices: List connected serial devices
- Background task support (taskId polling)
- pio_check: Static analysis (clang-tidy)
- pio_run_tests: Unit test execution

## Success Criteria
1. All 3 tools (build, upload, clean) functional
2. Diagnostic parsing produces correct structured output
3. Server works standalone (no vscode API)
4. Build produces single-file bundle < 5MB
5. Compatible with Claude Desktop MCP configuration
6. Tests passing (port from extension repo: 233 tests)
