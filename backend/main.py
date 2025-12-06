from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager
import os
import json
from db import init_db, get_db, close_pool
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
        print("DEBUG: Starting poll_loop task...")
        task = asyncio.create_task(poll_loop())
        
    yield
    
    if task:
        task.cancel()
    
    close_pool()

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
    cutoff = now - (30 * 60)
    
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
        
    # Filter out "stuck" trains (long dwells > 3 mins) ONLY AT TERMINALS
    # This prevents flat lines at terminals from dominating the chart
    # while preserving legitimate delays at other stations.
    
    terminals = gtfs_loader.get_terminal_stations(line)
    
    final_trips = []
    for trip in trips.values():
        positions = trip["positions"]
        if not positions:
            continue
            
        filtered_positions = []
        
        # Group by distance to identify dwells
        current_dwell = [positions[0]]
        
        for i in range(1, len(positions)):
            pos = positions[i]
            prev = positions[i-1]
            
            # Check if distance is effectively the same (handle float precision)
            if abs(pos["distance"] - prev["distance"]) < 0.01:
                current_dwell.append(pos)
            else:
                # Dwell ended. Process it.
                duration = current_dwell[-1]["timestamp"] - current_dwell[0]["timestamp"]
                
                # Check if this dwell is at a terminal
                stop_id = current_dwell[0]["stop_id"]
                base_stop_id = stop_id[:-1] if len(stop_id) > 3 else stop_id
                is_terminal = base_stop_id in terminals
                
                if duration > 180 and is_terminal: 
                    # Long dwell AT TERMINAL: Keep only the last point (hide the flat line)
                    filtered_positions.append(current_dwell[-1])
                else:
                    # Short dwell OR non-terminal: Keep all points
                    filtered_positions.extend(current_dwell)
                
                # Start new dwell
                current_dwell = [pos]
                
        # Process the final dwell
        if current_dwell:
            duration = current_dwell[-1]["timestamp"] - current_dwell[0]["timestamp"]
            
            stop_id = current_dwell[0]["stop_id"]
            base_stop_id = stop_id[:-1] if len(stop_id) > 3 else stop_id
            is_terminal = base_stop_id in terminals
            
            if duration > 180 and is_terminal:
                filtered_positions.append(current_dwell[-1])
            else:
                filtered_positions.extend(current_dwell)
        
        # Only include trip if it has at least 2 points (needed to draw a line)
        if len(filtered_positions) > 1:
            trip["positions"] = filtered_positions
            final_trips.append(trip)
        
    return final_trips

# Serve static files (React app)
# Check if static directory exists (it will in Docker)
if os.path.exists("../static"):
    app.mount("/", StaticFiles(directory="../static", html=True), name="static")
elif os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
