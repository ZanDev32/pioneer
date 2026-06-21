#!/usr/bin/env bash
# monitor.sh — Tier 3 fallback for `pio device monitor` (serial monitor)
# Usage: monitor.sh [project_dir] [environment] [port]
#
# Positional args (all optional):
#   $1  project_dir  (optional, defaults to cwd)
#   $2  environment  (optional)
#   $3  port         (optional, auto-detected if omitted)
#
# Note: This starts a long-running serial monitor session.
#       Press Ctrl+C to exit.

set -uo pipefail

PROJECT_DIR="${1:-.}"
ENVIRONMENT="${2:-}"
PORT="${3:-}"

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

cd "$PROJECT_DIR"

# Build the pio device monitor command
CMD="pio device monitor"

if [ -n "$PORT" ]; then
  CMD="$CMD -p $PORT"
fi

if [ -n "$ENVIRONMENT" ]; then
  CMD="$CMD -e $ENVIRONMENT"
fi

echo "Starting serial monitor: $CMD"
echo "Press Ctrl+C to exit."
eval "$CMD"

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "ERROR: Serial monitor exited with code: $EXIT_CODE"
  exit $EXIT_CODE
fi
