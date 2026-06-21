#!/usr/bin/env bash
# clean.sh — Tier 3 fallback for `pio run -t clean` (clean build artifacts)
# Usage: clean.sh <project_dir> <environment>
#
# Positional args (both required):
#   $1  project_dir  — Path to the PlatformIO project
#   $2  environment  — Build environment to clean (e.g., "esp32dev")
#
# Note: Per-environment only — safe for multi-env projects.

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: clean.sh <project_dir> <environment>"
  echo ""
  echo "  project_dir  Path to the PlatformIO project directory"
  echo "  environment  Build environment to clean (e.g., 'esp32dev')"
  echo ""
  echo "Example: clean.sh /path/to/project esp32dev"
  exit 1
fi

PROJECT_DIR="$1"
ENVIRONMENT="$2"

# Check pio CLI is in PATH
if ! command -v pio &>/dev/null; then
  echo "ERROR: pio CLI not found in PATH. Install PlatformIO Core first."
  echo "  Install: pip install platformio"
  exit 1
fi

# Validate project_dir contains platformio.ini
if [ ! -f "$PROJECT_DIR/platformio.ini" ]; then
  echo "ERROR: platformio.ini not found in '$PROJECT_DIR'"
  echo "  Specify a valid PlatformIO project directory."
  exit 1
fi

cd "$PROJECT_DIR"

echo "Cleaning build artifacts for environment: $ENVIRONMENT"
pio run -t clean -e "$ENVIRONMENT"

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "ERROR: Clean failed. Exit code: $EXIT_CODE"
  exit $EXIT_CODE
fi

echo "Clean completed successfully."
