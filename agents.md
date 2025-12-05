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
### Frontend (`/frontend`)
-   `src/App.jsx`: Main React component. Handles state (selected line, direction, **showHeadways**) and data fetching.
-   `src/Stringline.jsx`: D3.js visualization.
    -   **Scrollable Design**: The chart height is dynamic (`max(screen, stations * 60px)`). The container scrolls vertically while the header and controls remain fixed. This solves density issues on mobile.
    -   **Headways**: Calculates and displays time gaps (e.g., "4:30m") between trains at each station when toggled on.
    -   **Uniform Spacing**: Uses a **Fixed Ratio Interval** for the Y-axis (stations are spaced equally).
    -   **Linear Interpolation**: Uses `d3.curveLinear` for accurate speed representation.

### Configuration
-   `docker-compose.yml`: Defines the `ingestor` and `web` services.
-   `Dockerfile`: Multi-stage build for both Python backend and Node.js frontend.
-   `run.sh`: Helper script to build and start the project.
-   `start_prod.sh`: Startup script for single-container deployments. Runs both the ingestor (background) and web app (foreground).
-   `start_web.sh`: Startup script for web-only service (e.g. for Railway web service).

## Development Workflow
-   **Start**: `./run.sh` (builds and runs via docker-compose).
-   **Restart Web**: `docker-compose restart web` (fast restart for code changes).
-   **Logs**: `docker-compose logs -f`.
-   **Data**: Stored in `./data/subway.db`.

## Known Constraints & Decisions
-   **Scrollable Vertical Axis**: We abandoned the "fit to screen" approach for the Y-axis. On mobile, 30+ stations cannot fit in 500px legibly. The graph is now vertically scrollable with a minimum of 60px per station.
-   **Terminal Dwell Filtering**: In `backend/main.py`, we filter out train positions if a train dwells at a **terminal** station for > 3 minutes. This prevents "flat lines" from dominating the chart while preserving legitimate delays at intermediate stations.
-   **Uniform Spacing**: The Y-axis does *not* represent physical distance. It represents station index. This was a deliberate design choice to fix overlapping labels.
-   **Linear Interpolation**: We use straight lines because Express trains (skipping stops) caused `MonotoneX` to create misleading curves on the uniform grid.
-   **Southbound Orientation**: The map is built using Southbound trips to ensure a consistent "Top-Down" orientation (Manhattan -> Brooklyn).

## Future Work
-   Add support for more lines (currently N, Q, R, W).
-   Add "Live" indicator for real-time updates.

## Deployment (Railway) - Recommended
To prevent data loss during updates, you must deploy the **Ingestor** and **Web App** as two separate services sharing a database.

1.  **Database**: Create a **PostgreSQL** service in Railway.
2.  **Ingestor Service**:
    -   Create a new service from this GitHub repo.
    -   **Variables**: Add `DATABASE_URL` (link to Postgres).
    -   **Start Command**: `python backend/ingest_entrypoint.py`
    -   *Note*: This service will never sleep and keeps collecting data.
3.  **Web Service**:
    -   Create *another* service from the *same* GitHub repo.
    -   **Variables**: Add `DATABASE_URL` (link to same Postgres) and `DISABLE_POLLER=true`.
    -   **Start Command**: `./start_web.sh`
    -   **Domain**: Assign a domain to this service.

### Watch Paths (Optimization)
To prevent unnecessary restarts (which cause data gaps for the ingestor), configure **Watch Paths** in Railway Settings -> Deploy -> Watch Paths:

**Ingestor Service**:
```text
/backend/**
/gtfs_subway/**
requirements.txt
```

**Web Service**:
```text
/frontend/**
/backend/**
/Dockerfile
start_web.sh
```

**Result**: When you push changes, Railway will redeploy both. However, because they are separate, the Ingestor's brief restart won't affect the Website, and vice-versa. (Actually, Railway redeploys are zero-downtime for the Web App, but the Ingestor will restart. To have *truly* zero interruption for ingestion, you'd need more complex orchestration, but this split minimizes the impact significantly compared to a monolith).

## Troubleshooting

### Database Connection Issues
If you see `INFO:db:Initializing database: sqlite` in your logs, your Web Service is not connecting to Postgres.
**Fix**:
1.  Go to your **Postgres Service** -> **Variables**.
2.  **Copy** the `DATABASE_URL` value (starts with `postgresql://`).
3.  Go to your **Web Service** -> **Variables**.
4.  Add `DATABASE_URL` and **Paste** the value manually.
5.  Railway will redeploy, and you should see `INFO:db:Initializing database: postgres`.
