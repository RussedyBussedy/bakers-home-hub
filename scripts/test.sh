#!/usr/bin/env bash
# Build the demo bundle, serve it, run the click-through flows, tear down.
set -e
cd "$(dirname "$0")/.."
VITE_DEMO_ONLY=true npx vite build 2>&1 | grep -E "error|✓ built" || true
npx vite preview --port 4173 --strictPort >/tmp/preview.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:4173/ && break; sleep 0.5; done
node scripts/flows.mjs "$@"
