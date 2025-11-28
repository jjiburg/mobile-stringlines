# Project: Subway Stringline Monitor

## Overview
This project is a real-time visualization of NYC Subway trains (N, Q, R, W lines) using a "Stringline" chart (Time vs. Distance). It fetches data from the MTA GTFS-RT API and visualizes it using a React frontend with D3.js.

## Architecture
The application is split into two services using Docker Compose:

1.  **`ingestor`**:
    -   **Role**: Background service that polls the MTA API every 15 seconds.
    -   **Entrypoint**: `backend/ingest_entrypoint.py`.
    -   **Logic**: `backend/poller.py` fetches GTFS-RT feeds, parses them, and stores train positions in SQLite.
    -   **Data**: Persists data to `/data/subway.db` (mounted volume).

2.  **`web`**:
    -   **Role**: Serves the React frontend and the FastAPI backend.
    -   **Entrypoint**: `backend/main.py` (via `uvicorn`).
    -   **API**:
        -   `GET /api/stations?line=Q`: Returns the list of stations for a specific line.
        -   `GET /api/history?line=Q`: Returns historical train positions for the chart.
    -   **Frontend**: Served statically from `/app/static` (built from `frontend/`).

## Key Files & Directories

### Backend (`/backend`)
-   `gtfs_loader.py`: Parses static GTFS data (`stops.txt`, `trips.txt`, etc.) at startup to build the station map and calculate distances.
    -   **Crucial Logic**:
        -   **Re-syncing**: Ensures monotonic distances by snapping to known stations when processing multiple routes.
        -   **Direction Filtering**: Filters candidate trips by `direction_id=1` (Southbound) to ensure consistent map orientation.
-   `poller.py`: Handles MTA API polling.
    -   **Inference**: Infers `direction_id` from `trip_id` (e.g., `..N` vs `..S`) if missing.
-   `db.py`: SQLite database connection and schema.
-   `main.py`: FastAPI application definition.

### Frontend (`/frontend`)
-   `src/App.jsx`: Main React component. Handles state (selected line, direction) and data fetching.
-   `src/Stringline.jsx`: D3.js visualization.
    -   **Uniform Spacing**: Uses a **Fixed Ratio Interval** for the Y-axis (stations are spaced equally, ignoring physical distance) to prevent label overlap.
    -   **Linear Interpolation**: Uses `d3.curveLinear` to draw straight lines between data points, avoiding artifacts from smoothing sparse data.

### Configuration
-   `docker-compose.yml`: Defines the `ingestor` and `web` services.
-   `Dockerfile`: Multi-stage build for both Python backend and Node.js frontend.
-   `run.sh`: Helper script to build and start the project.

## Development Workflow
-   **Start**: `./run.sh` (builds and runs via docker-compose).
-   **Restart Web**: `docker-compose restart web` (fast restart for code changes).
-   **Logs**: `docker-compose logs -f`.
-   **Data**: Stored in `./data/subway.db`.

## Known Constraints & Decisions
-   **Uniform Spacing**: The Y-axis does *not* represent physical distance. It represents station index. This was a deliberate design choice to fix overlapping labels.
-   **Linear Interpolation**: We use straight lines because Express trains (skipping stops) caused `MonotoneX` to create misleading curves on the uniform grid.
-   **Southbound Orientation**: The map is built using Southbound trips to ensure a consistent "Top-Down" orientation (Manhattan -> Brooklyn).

## Future Work
-   Add support for more lines (currently N, Q, R, W).
-   Improve mobile touch interactions (scrubber is basic).
-   Add "Live" indicator for real-time updates.

## Deployment (Railway)
This project is configured for easy deployment on [Railway](https://railway.app/).

1.  **Push to GitHub**: Ensure this repo is on GitHub.
2.  **New Project**: In Railway, create a new project from your GitHub repo.
3.  **Dockerfile**: Railway will automatically detect the `Dockerfile`.
4.  **Persistence (Optional but Recommended)**:
    -   By default, the SQLite database (`/data/subway.db`) is ephemeral.
    -   To persist data, add a **Volume** in Railway.
    -   Mount path: `/data`.
5.  **Environment Variables**:
    -   `PORT`: Railway sets this automatically.
    -   `USE_MOCK_DATA`: Set to `false` (default).
    -   `DISABLE_POLLER`: Set to `false` (default).
