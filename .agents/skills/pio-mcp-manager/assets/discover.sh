#!/usr/bin/env bash
# discover.sh — Tier 3 fallback for `pio device list` (list serial devices)
# Usage: discover.sh
#
# No arguments. Lists all connected serial devices detected by PlatformIO.

set -euo pipefail

# Check pio CLI is in PATH
if ! command -v pio &>/dev/null; then
  echo "ERROR: pio CLI not found in PATH. Install PlatformIO Core first."
  echo "  Install: pip install platformio"
  exit 1
fi

echo "Scanning for connected serial devices..."
pio device list

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "ERROR: Device discovery failed. Exit code: $EXIT_CODE"
  exit $EXIT_CODE
fi
