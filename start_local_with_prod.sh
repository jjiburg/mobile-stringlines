#!/bin/bash

# Default config file
CONFIG_FILE="${1:-config.env}"

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

# Start uvicorn on port 8080
uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload
