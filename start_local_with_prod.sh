#!/bin/bash

# Resolve the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

# Default config file (relative to project root)
CONFIG_FILE="${1:-$PROJECT_ROOT/config.env}"

if [ -f "$CONFIG_FILE" ]; then
    echo "Loading config from $CONFIG_FILE..."
    export $(cat "$CONFIG_FILE" | xargs)
else
    echo "Warning: Config file '$CONFIG_FILE' not found."
fi

# Check if DATABASE_URL is provided
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is not set."
    echo "Usage: ./start_local_with_prod.sh [config_file]"
    echo "Or create a config.env file with DATABASE_URL=..."
    exit 1
fi

echo "Starting Backend with Production Database..."
echo "Database URL: ${DATABASE_URL:0:20}..." # Hide credentials

# Add backend to PYTHONPATH so imports work (relative to project root)
export PYTHONPATH=$PYTHONPATH:$PROJECT_ROOT/backend

# Check if port 8080 is in use and kill it
if lsof -i :8080 > /dev/null; then
    echo "Port 8080 is already in use. Killing existing process..."
    lsof -ti :8080 | xargs kill -9
fi

# Check if port 5173 is in use and kill it
if lsof -i :5173 > /dev/null; then
    echo "Port 5173 is already in use. Killing existing process..."
    lsof -ti :5173 | xargs kill -9
fi

# Function to kill background processes on exit
cleanup() {
    echo "Stopping all processes..."
    kill $(jobs -p) 2>/dev/null
}
trap cleanup EXIT

# Start uvicorn on port 8080 (run from project root)
cd "$PROJECT_ROOT"
echo "Starting Backend..."
uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload &

# Wait for Backend to be ready
echo "Waiting for Backend to start..."
while ! nc -z localhost 8080; do   
  sleep 0.5
done
echo "Backend is ready!"

# Start Frontend
echo "Starting Frontend..."
cd "$PROJECT_ROOT/frontend"
npm run dev
