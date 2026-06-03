web: bash -c "([ -e cassandra ] || ln -sf . cassandra) && python -m uvicorn orchestrator.api_server:app --host 0.0.0.0 --port ${PORT:-8001}"
