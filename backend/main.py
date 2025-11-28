from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager
import os
import json
from db import init_db, get_db
from poller import poll_loop
from mock_data import generate_mock_data
import gtfs_loader

# Environment variable to control mock mode and poller
USE_MOCK_DATA = os.environ.get("USE_MOCK_DATA", "false").lower() == "true"
DISABLE_POLLER = os.environ.get("DISABLE_POLLER", "false").lower() == "true"

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    gtfs_loader.load_data()
    
    task = None
    if not USE_MOCK_DATA and not DISABLE_POLLER:
        task = asyncio.create_task(poll_loop())
        
    yield
    
    if task:
        task.cancel()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/stations")
def get_stations(line: str = Query(None)):
    return gtfs_loader.get_stations_list(route_id=line)

@app.get("/api/history")
def get_history(line: str = Query("Q")):
    if USE_MOCK_DATA:
        return generate_mock_data()
    
    # Fetch from DB
    # Group by trip_id
    # Limit to last 60 mins
    import time
    now = time.time()
    cutoff = now - (60 * 60)
    
    from db import get_db, execute_query
    
    with get_db() as conn:
        cursor = execute_query(conn, """
            SELECT p.trip_id, p.timestamp, p.distance, p.stop_id, t.direction_id
            FROM positions p
            JOIN trips t ON p.trip_id = t.trip_id
            WHERE t.route_id = ? AND p.timestamp > ?
            ORDER BY p.timestamp ASC
        """, (line, cutoff))
        rows = cursor.fetchall()
        
    trips = {}
    for r in rows:
        tid = r["trip_id"]
        if tid not in trips:
            trips[tid] = {
                "trip_id": tid,
                "route_id": line,
                "direction_id": r["direction_id"],
                "positions": []
            }
        trips[tid]["positions"].append({
            "timestamp": r["timestamp"],
            "distance": r["distance"],
            "stop_id": r["stop_id"]
        })
        
    return list(trips.values())

# Serve static files (React app)
# Check if static directory exists (it will in Docker)
if os.path.exists("../static"):
    app.mount("/", StaticFiles(directory="../static", html=True), name="static")
elif os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
