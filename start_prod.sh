#!/bin/bash

# Ensure data directory exists
mkdir -p /data

# Start ingestor in background
echo "Starting Ingestor..."
python backend/ingest_entrypoint.py &

# Start web app in foreground
# Railway provides PORT env var
PORT="${PORT:-8080}"
echo "Starting Web App on port $PORT..."
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
