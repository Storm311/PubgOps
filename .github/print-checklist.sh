#!/usr/bin/env bash
# Print a section from .github/ci-checklist.md into the log + step summary.
# Usage: print-checklist.sh "1 · Quality" "2 · Unit tests"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="$ROOT/.github/ci-checklist.md"
START="${1:?section start heading fragment}"
END="${2:-}"

if [[ ! -f "$FILE" ]]; then
  echo "::error::Missing $FILE"
  exit 1
fi

SECTION="$(
  awk -v start="$START" -v end="$END" '
    index($0, start) && /^## / { p=1 }
    p && end != "" && index($0, end) && /^## / && index($0, start) == 0 { exit }
    p { print }
  ' "$FILE"
)"

if [[ -z "$SECTION" ]]; then
  echo "::error::Could not find checklist section starting with: $START"
  exit 1
fi

echo "$SECTION"
{
  echo ""
  echo "$SECTION"
  echo ""
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
