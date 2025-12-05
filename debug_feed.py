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

def main():
    # Load GTFS data
    gtfs_loader.load_data()
    
    logger.info("Fetching live feed...")
    feed = fetch_feed()
    
    if not feed:
        logger.error("Failed to fetch feed.")
        return

    unmatched = set()
    
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
                    # Try to find context from trip update if available
                    # We need to find the TripUpdate for this trip to see the sequence
                    unmatched.add(stop_id)
    
    # Second pass to find context in TripUpdates
    logger.info("Checking TripUpdates for context...")
    for entity in feed.entity:
        if entity.trip_update:
            tu = entity.trip_update
            trip_id = tu.trip.trip_id
            
            # Check if this trip had an unmatched stop
            # We need to iterate through updates to find the unmatched stop_id
            for stu in tu.stop_time_update:
                if stu.stop_id in unmatched:
                    logger.info(f"Context for {stu.stop_id} in trip {trip_id}:")
                    # Print full sequence of stops in this update
                    stops = [s.stop_id for s in tu.stop_time_update]
                    try:
                        idx = stops.index(stu.stop_id)
                        prev = stops[idx-1] if idx > 0 else "None"
                        next_s = stops[idx+1] if idx < len(stops)-1 else "None"
                        logger.info(f"  ... {prev} -> [{stu.stop_id}] -> {next_s} ...")
                    except ValueError:
                        pass

                    
    if not unmatched:
        logger.info("No unmatched stop IDs found.")
    else:
        logger.info(f"Found {len(unmatched)} unique unmatched stop IDs.")

if __name__ == "__main__":
    main()
