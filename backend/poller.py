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
FEED_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw"

def fetch_feed():
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"
    }
    try:
        response = requests.get(FEED_URL, headers=headers, timeout=10)
        if response.status_code == 403:
            logger.error("MTA API returned 403 Forbidden. Please check your MTA_API_KEY.")
            return None
        response.raise_for_status()
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)
        return feed
    except Exception as e:
        logger.error(f"Error fetching feed: {e}")
        return None

def process_feed(feed):
    if not feed:
        return

    count_updates = 0
    with get_db() as conn:
        now = time.time()
        
        # First pass: Trip Updates to get metadata and fallback positions
        for entity in feed.entity:
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
                
                # ... (rest of logic)

        # Second pass: Vehicle Positions (Preferred)
        for entity in feed.entity:
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
                base_stop_id = stop_id[:-1] if len(stop_id) > 3 else stop_id
                
                ts = v.timestamp
                if ts > now:
                    ts = now
                
                dist = gtfs_loader.get_station_distance(stop_id)
                if dist is None:
                    logger.info(f"Unmatched stop_id: {stop_id}")
                if dist is not None:
                    execute_query(conn, """
                        INSERT INTO positions (trip_id, timestamp, stop_id, distance)
                        VALUES (?, ?, ?, ?)
                    """, (trip_id, ts, stop_id, dist))
                    count_updates += 1

        conn.commit()
        
        # Prune old data
        cutoff = now - (24 * 60 * 60)
        execute_query(conn, "DELETE FROM positions WHERE timestamp < ?", (cutoff,))
        conn.commit()
        
    logger.info(f"Processed feed. Added {count_updates} positions.")

async def poll_loop():
    while True:
        logger.info("Polling MTA...")
        feed = fetch_feed()
        process_feed(feed)
        await asyncio.sleep(30)
