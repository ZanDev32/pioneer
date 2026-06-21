#!/usr/bin/env bash
# test.sh — Tier 3 fallback for `pio test` (run unit tests)
# Usage: test.sh [project_dir] [environment]
#
# Positional args (both optional):
#   $1  project_dir  (optional, defaults to cwd)
#   $2  environment  (optional, runs tests for all environments if omitted)

set -euo pipefail

PROJECT_DIR="${1:-.}"
ENVIRONMENT="${2:-}"

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

# Build the pio test command
if [ -n "$ENVIRONMENT" ]; then
  echo "Running tests for environment: $ENVIRONMENT"
  pio test -e "$ENVIRONMENT"
else
  echo "Running tests for all environments"
  pio test
fi

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "ERROR: Tests failed. Exit code: $EXIT_CODE"
  exit $EXIT_CODE
fi

echo "Tests completed successfully."
