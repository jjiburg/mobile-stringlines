#!/bin/sh
PORT=${PORT:-8080}
echo "Starting Web Service on port $PORT"
exec uvicorn backend.main:app --host 0.0.0.0 --port "$PORT"
