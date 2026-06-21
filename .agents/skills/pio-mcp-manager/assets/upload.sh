#!/usr/bin/env bash
# upload.sh — Tier 3 fallback for `pio run -t upload` (flash firmware)
# Usage: upload.sh [project_dir] [environment] [port] [--verbose]
#
# Positional args:
#   $1  project_dir  (optional, defaults to cwd)
#   $2  environment  (optional, defaults to platformio.ini default_envs)
#   $3  port         (optional, auto-detected if omitted)
# Flags:
#   --verbose  passes -v to pio for detailed output

set -euo pipefail

PROJECT_DIR="${1:-.}"
ENVIRONMENT="${2:-}"
PORT="${3:-}"
VERBOSE=""

# Parse flags from remaining args
for arg in "${@:4}"; do
  case "$arg" in
    --verbose) VERBOSE="-v" ;;
    *) echo "WARNING: Unknown argument: $arg" ;;
  esac
done

# Check pio CLI is in PATH
if ! command -v pio &>/dev/null; then
  echo "ERROR: pio CLI not found in PATH. Install PlatformIO Core first."
  echo "  Install: pip install platformio"
  exit 1
fi

# Validate project_dir contains platformio.ini
if [ -n "$PROJECT_DIR" ] && [ "$PROJECT_DIR" != "." ]; then
  if [ ! -f "$PROJECT_DIR/platformio.ini" ]; then
    echo "ERROR: platformio.ini not found in '$PROJECT_DIR'"
    echo "  Specify a valid PlatformIO project directory."
    exit 1
  fi
fi

echo "⚠ WARNING: Uploading firmware without MCP server safety guardrails."
echo "  Ensure the correct device is connected and the right port is selected."

cd "$PROJECT_DIR"

# Build the pio run command with upload target
CMD="pio run -t upload"

if [ -n "$ENVIRONMENT" ]; then
  CMD="$CMD -e $ENVIRONMENT"
fi

if [ -n "$PORT" ]; then
  CMD="$CMD -p $PORT"
fi

if [ -n "$VERBOSE" ]; then
  CMD="$CMD $VERBOSE"
fi

echo "Executing: $CMD"
eval "$CMD"

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  if [ $EXIT_CODE -eq 1 ]; then
    echo "ERROR: Upload failed. Exit code: $EXIT_CODE"
    echo "  No serial device found. Run discover.sh to list available ports."
  else
    echo "ERROR: Upload failed. Exit code: $EXIT_CODE"
  fi
  exit $EXIT_CODE
fi

echo "Upload completed successfully."
