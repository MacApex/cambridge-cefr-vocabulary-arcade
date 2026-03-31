#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

URL="http://127.0.0.1:5173"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found on this Mac."
  echo "Install Node.js, then run this launcher again."
  read -r "?Press Enter to close..."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found on this Mac."
  echo "Install Node.js/npm, then run this launcher again."
  read -r "?Press Enter to close..."
  exit 1
fi

if lsof -ti tcp:5173 >/dev/null 2>&1; then
  echo "A server is already using port 5173."
  echo "Opening $URL"
  open "$URL"
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

(
  for _ in {1..60}; do
    if curl -fsS "$URL" >/dev/null 2>&1; then
      echo "Opening $URL"
      open "$URL"
      exit 0
    fi
    sleep 1
  done

  echo "The dev server did not become ready in time."
  echo "If it finishes starting later, open $URL manually."
) &
WAITER_PID=$!

echo "Starting Cambridge CEFR Vocabulary Arcade..."
echo "Working directory: $SCRIPT_DIR"
echo

npm run dev -- --host 127.0.0.1
STATUS=$?

kill "$WAITER_PID" 2>/dev/null || true
exit "$STATUS"
