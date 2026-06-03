#!/bin/bash
# Render start script — self-contained, no CWD dependency
set -e

# Always cd to the directory this script lives in, regardless of where bash was invoked
# (BASH_SOURCE[0] is the script's own path even when called from another directory)
cd "$(dirname "${BASH_SOURCE[0]}")"

# Create cassandra -> . symlink so "from cassandra.tools..." imports resolve
if [ ! -e "cassandra" ]; then
  ln -sf . cassandra
  echo "[start] Created cassandra -> . symlink"
fi

exec uvicorn orchestrator.api_server:app --host 0.0.0.0 --port "${PORT:-8001}"
