#!/bin/bash

# Ensure gtfs_subway directory exists
if [ ! -d "gtfs_subway" ]; then
    echo "Error: gtfs_subway directory not found!"
    exit 1
fi

# Ensure data directory exists
mkdir -p data

# Stop and remove old single-container app if running
if [ "$(docker ps -q -f name=subway-monitor)" ]; then
    echo "Stopping old subway-monitor container..."
    docker stop subway-monitor
    docker rm subway-monitor
fi

# Run with docker-compose
echo "Starting Subway Monitor with Docker Compose..."
docker-compose down # Ensure clean slate
docker-compose up --build -d

echo "Services started."
echo "Web App: http://localhost:8080"
echo "To view logs: docker-compose logs -f"
