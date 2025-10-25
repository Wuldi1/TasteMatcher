#!/usr/bin/env sh
set -e
# start backend and frontend in parallel; keep logs visible
# uses pnpm workspace filter
pnpm --filter backend dev &
BACKEND_PID=$!
pnpm --filter frontend dev &
FRONTEND_PID=$!
wait $BACKEND_PID $FRONTEND_PID