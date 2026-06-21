#!/usr/bin/env bash
# build.sh — Tier 3 fallback for `pio run` (build firmware)
# Usage: build.sh [project_dir] [environment] [--verbose]
#
# Positional args:
#   $1  project_dir  (optional, defaults to cwd)
#   $2  environment  (optional, defaults to platformio.ini default_envs)
# Flags:
#   --verbose  passes -v to pio for detailed output

set -euo pipefail

PROJECT_DIR="${1:-.}"
ENVIRONMENT="${2:-}"
VERBOSE=""

# Parse flags from remaining args
for arg in "${@:3}"; do
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

# Build the pio run command
cd "$PROJECT_DIR"

if [ -n "$ENVIRONMENT" ]; then
  echo "Building environment: $ENVIRONMENT ${VERBOSE:+(verbose)}"
  pio run -e "$ENVIRONMENT" $VERBOSE
else
  echo "Building with default environment(s) ${VERBOSE:+(verbose)}"
  pio run $VERBOSE
fi

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "ERROR: Build failed. Exit code: $EXIT_CODE"
  exit $EXIT_CODE
fi

echo "Build completed successfully."
