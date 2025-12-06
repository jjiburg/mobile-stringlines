import asyncio
import time
import requests
import json
import os
import logging
from google.transit import gtfs_realtime_pb2
from db import get_db, execute_query
import gtfs_loader
from config import SUBWAY_DATA

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Collect unique feed URLs from config
FEED_URLS = set()
for division in SUBWAY_DATA.values():
    for url in division["feeds"]:
        FEED_URLS.add(url)

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
        
        # Use a list of entity processing functions or just two passes
        
        # First pass: Trip Updates
        for i, entity in enumerate(feed.entity):
            try:
                if entity.trip_update:
                    tu = entity.trip_update
                    trip_id = tu.trip.trip_id
                    route_id = tu.trip.route_id
                    
                    # Insert trip info
                    direction_id = 0
                    if tu.trip.HasField('direction_id'):
                        direction_id = tu.trip.direction_id
                    else:
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
                # Log occasional errors but don't spam for every single one if it's common
                if i < 5: 
                    logger.warning(f"Error processing TU {i}: {e}")
                pass
            
            # Commit periodically
            if (i + 1) % 100 == 0:
                conn.commit()

        # Second pass: Vehicle Positions
        for i, entity in enumerate(feed.entity):
            try:
                if entity.vehicle:
                    v = entity.vehicle
                    trip_id = v.trip.trip_id
                    route_id = v.trip.route_id
                    
                    # Ensure trip exists in DB (redundant but safe)
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
                        
                    ts = v.timestamp
                    if ts > now:
                        ts = now
                    
                    # CRITICAL: Pass route_id to get correct relative distance
                    dist = gtfs_loader.get_station_distance(stop_id, route_id)
                    
                    if dist is not None:
                        execute_query(conn, """
                            INSERT INTO positions (trip_id, timestamp, stop_id, distance)
                            VALUES (?, ?, ?, ?)
                        """, (trip_id, ts, stop_id, dist))
                        count_updates += 1
            except Exception as e:
                if i < 5:
                    logger.warning(f"Error processing VP {i}: {e}")
                pass

            if (i + 1) % 100 == 0:
                conn.commit()

        conn.commit()
        
        # Prune old data
        try:
            cutoff = now - (24 * 60 * 60)
            execute_query(conn, "DELETE FROM positions WHERE timestamp < ?", (cutoff,))
            conn.commit()
        except Exception as e:
            logger.error(f"Error pruning data: {e}")
        
    logger.info(f"Processed feed. Added {count_updates} positions.")

def run_poll_cycle():
    logger.info("Starting poll cycle...")
    for url in FEED_URLS:
        try:
            logger.info(f"Fetching {url}...")
            feed = fetch_feed(url)
            if feed:
                logger.info(f"Processing {url}...")
                process_feed(feed)
            else:
                logger.warning(f"No content for {url}")
        except Exception as e:
            logger.error(f"Failed to process feed {url}: {e}")

    logger.info("Poll cycle complete.")

async def poll_loop():
    while True:
        await asyncio.to_thread(run_poll_cycle)
        await asyncio.sleep(10) 

