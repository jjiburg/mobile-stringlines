import asyncio
import time
import requests
import json
import os
import logging
from google.transit import gtfs_realtime_pb2
from db import get_db, execute_query
import gtfs_loader

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MTA_API_KEY = os.environ.get("MTA_API_KEY") # Not required for new endpoints
# NQRW feed
# MTA Feeds
FEED_URLS = [
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",      # 1, 2, 3, 4, 5, 6, 7, GS
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",  # A, C, E, H, FS
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm", # B, D, F, M
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",    # G
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",   # J, Z
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw", # N, Q, R, W
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",    # L
    # "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si" # SIR (Staten Island) - Optional
]

def fetch_feed(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 403:
            logger.error(f"MTA API returned 403 Forbidden for {url}. Please check your MTA_API_KEY.")
            return None
        response.raise_for_status()
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)
        return feed
    except Exception as e:
        logger.error(f"Error fetching feed {url}: {e}")
        return None

def process_feed(feed):
    if not feed:
        return

    count_updates = 0
    with get_db() as conn:
        now = time.time()
        
        # First pass: Trip Updates to get metadata and fallback positions
        for i, entity in enumerate(feed.entity):
            try:
                if entity.trip_update:
                    tu = entity.trip_update
                    trip_id = tu.trip.trip_id
                    route_id = tu.trip.route_id
                    
                    # Insert trip info
                    # direction_id is optional in GTFS-RT, but usually present in NYCT
                    # If missing, we try to infer from trip_id
                    direction_id = 0
                    if tu.trip.HasField('direction_id'):
                        direction_id = tu.trip.direction_id
                    else:
                        # Infer from trip_id (e.g. 123456_Q..N)
                        if '..S' in trip_id:
                            direction_id = 1
                        elif '..N' in trip_id:
                            direction_id = 0
                    
                    execute_query(conn, """
                        INSERT INTO trips (trip_id, route_id, start_time, direction_id)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(trip_id) DO NOTHING
                    """, (trip_id, route_id, tu.trip.start_time, direction_id))
            except Exception as e:
                logger.error(f"Error processing trip update {i}: {e}")
            
            if (i + 1) % 50 == 0:
                logger.info(f"Processed {i + 1} TUs...")
                conn.commit()

        # Second pass: Vehicle Positions (Preferred)
        for i, entity in enumerate(feed.entity):
            try:
                if entity.vehicle:
                    v = entity.vehicle
                    trip_id = v.trip.trip_id
                    route_id = v.trip.route_id
                    
                    # Ensure trip exists in DB
                    direction_id = 0
                    if v.trip.HasField('direction_id'):
                        direction_id = v.trip.direction_id
                    else:
                        if '..S' in trip_id:
                            direction_id = 1
                        elif '..N' in trip_id:
                            direction_id = 0
                            
                    execute_query(conn, """
                        INSERT INTO trips (trip_id, route_id, start_time, direction_id)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(trip_id) DO NOTHING
                    """, (trip_id, route_id, v.trip.start_time, direction_id))
                    
                    stop_id = v.stop_id
                    if not stop_id:
                        continue
                        
                    base_stop_id = stop_id[:-1] if len(stop_id) > 3 else stop_id
                    
                    ts = v.timestamp
                    if ts > now:
                        ts = now
                    
                    dist = gtfs_loader.get_station_distance(stop_id)
                    if dist is not None:
                        execute_query(conn, """
                            INSERT INTO positions (trip_id, timestamp, stop_id, distance)
                            VALUES (?, ?, ?, ?)
                        """, (trip_id, ts, stop_id, dist))
                        count_updates += 1
            
                if (i + 1) % 50 == 0:
                    logger.info(f"Processed {i + 1} entities...")
                    conn.commit() # Commit frequently to avoid huge transactions
            except Exception as e:
                logger.error(f"Error processing vehicle position {i}: {e}")

        conn.commit()
        
        # Prune old data
        cutoff = now - (24 * 60 * 60)
        execute_query(conn, "DELETE FROM positions WHERE timestamp < ?", (cutoff,))
        conn.commit()
        
    # logger.info(f"Processed feed. Added {count_updates} positions.")

def run_poll_cycle():
    try:
        print("DEBUG: Starting poll cycle...")
        logger.info("Starting poll cycle...")
        for url in FEED_URLS:
            print(f"DEBUG: Fetching {url}...")
            logger.info(f"Fetching {url}...")
            feed = fetch_feed(url)
            if feed:
                print(f"DEBUG: Processing {url} with {len(feed.entity)} entities...")
                logger.info(f"Processing {url} with {len(feed.entity)} entities...")
                process_feed(feed)
            else:
                print(f"DEBUG: No feed content for {url}")
                logger.warning(f"No feed content for {url}")
        print("DEBUG: Poll cycle complete.")
        logger.info("Poll cycle complete.")
    except Exception as e:
        print(f"DEBUG: Error in poll cycle: {e}")
        logger.error(f"Error in poll cycle: {e}")

async def poll_loop():
    while True:
        await asyncio.to_thread(run_poll_cycle)
        await asyncio.sleep(5) # Poll more frequently now that it's non-blocking? Keep 30s for now or 15s. User wants speed. Let's do 10s.
