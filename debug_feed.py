import sys
import os
import logging

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

import gtfs_loader
from poller import fetch_feed

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MTA Feeds
FEED_URLS = [
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",      # 1, 2, 3, 4, 5, 6, 7, GS
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",  # A, C, E, H, FS
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm", # B, D, F, M
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",    # G
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",   # J, Z
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw", # N, Q, R, W
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",    # L
]

def main():
    # Load GTFS data
    gtfs_loader.load_data()
    
    logger.info("Fetching live feeds...")
    
    unmatched = set()
    
    for url in FEED_URLS:
        logger.info(f"Checking {url}...")
        feed = fetch_feed(url)
        
        if not feed:
            logger.error(f"Failed to fetch feed {url}")
            continue

        for entity in feed.entity:
            if entity.vehicle:
                v = entity.vehicle
                stop_id = v.stop_id
                if not stop_id:
                    continue
                    
                dist = gtfs_loader.get_station_distance(stop_id)
                if dist is None:
                    if stop_id not in unmatched:
                        logger.info(f"Unmatched stop_id: '{stop_id}' (Trip: {v.trip.trip_id}, Route: {v.trip.route_id})")
                        unmatched.add(stop_id)
    
    if not unmatched:
        logger.info("No unmatched stop IDs found across all feeds.")
    else:
        logger.info(f"Found {len(unmatched)} unique unmatched stop IDs.")

if __name__ == "__main__":
    main()
