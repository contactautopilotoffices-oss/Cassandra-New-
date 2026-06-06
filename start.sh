#!/bin/bash
# Render start script — creates cassandra package shim so imports resolve
# The repo root IS the cassandra package, so we symlink it as such.
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Create a cassandra symlink pointing to repo root so
# "from cassandra.tools..." resolves correctly
if [ ! -e "$REPO_ROOT/cassandra" ]; then
  ln -s "$REPO_ROOT" "$REPO_ROOT/cassandra"
  echo "[start] Created cassandra -> . symlink"
fi

exec uvicorn orchestrator.api_server:app --host 0.0.0.0 --port "${PORT:-8001}"
