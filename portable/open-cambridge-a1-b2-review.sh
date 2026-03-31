#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if command -v python3 >/dev/null 2>&1; then
  exec python3 portable_server.py
fi

echo "Python 3 was not found on this machine."
echo "Opening the HTML file directly instead."
echo "If progress does not persist, install Python 3 and run this launcher again."

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$SCRIPT_DIR/cambridge-a1-b2-review.html" >/dev/null 2>&1 || true
fi
