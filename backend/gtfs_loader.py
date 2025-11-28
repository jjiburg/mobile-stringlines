import csv
import os
import logging

logger = logging.getLogger(__name__)

GTFS_DIR = os.environ.get("GTFS_DIR", "gtfs_subway")
STOPS_FILE = os.path.join(GTFS_DIR, 'stops.txt')
TRIPS_FILE = os.path.join(GTFS_DIR, 'trips.txt')
STOP_TIMES_FILE = os.path.join(GTFS_DIR, 'stop_times.txt')

_STATION_MAP = {} # stop_id -> distance
_ROUTE_STATIONS = {} # route_id -> set(stop_ids)

def load_data():
    global _STATION_MAP, _STATIONS_LIST, _ROUTE_STATIONS
    
    if not os.path.exists(GTFS_DIR):
        logger.error(f"GTFS directory {GTFS_DIR} not found!")
        return

    logger.info("Loading GTFS data...")
    
    # 1. Load Stops
    stops_info = {}
    with open(STOPS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            stops_info[row['stop_id']] = row['stop_name']

    # 2. Find candidate trips (Longest for each route)
    # Process Local lines first (R, W) to ensure all stops are mapped with correct spacing.
    # Then Express lines (N, Q) will map to the existing station distances.
    routes = ['R', 'W', 'N', 'Q']
    candidate_trips = {r: [] for r in routes}
    
    with open(TRIPS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rid = row['route_id']
            # Filter by direction_id=1 (Southbound) to ensure consistent orientation
            # If we mix directions, the station map will be scrambled.
            if rid in routes and row['direction_id'] == '1':
                candidate_trips[rid].append(row['trip_id'])
                
    # Limit candidates for performance
    all_candidate_trip_ids = set()
    for rid in routes:
        # Take first 100
        for tid in candidate_trips[rid][:100]:
            all_candidate_trip_ids.add(tid)
            
    # 3. Scan stop_times to find sequences
    trip_stops_map = {tid: [] for tid in all_candidate_trip_ids}
    with open(STOP_TIMES_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            tid = row['trip_id']
            if tid in all_candidate_trip_ids:
                trip_stops_map[tid].append((int(row['stop_sequence']), row['stop_id']))
                
    route_sequences = {}
    for rid in routes:
        best_seq = []
        for tid in candidate_trips[rid][:100]:
            seq = trip_stops_map.get(tid, [])
            seq.sort()
            stop_ids = [s[1] for s in seq]
            if len(stop_ids) > len(best_seq):
                best_seq = stop_ids
        route_sequences[rid] = best_seq
        logger.info(f"Route {rid}: Found sequence with {len(best_seq)} stops")

    # 4. Align and assign distances
    station_dist = {}
    _ROUTE_STATIONS = {r: set() for r in routes}
    
    def process_sequence(seq, route_id, anchor_id='R17', anchor_dist=50, step=2):
        # Initial anchor
        current_anchor_dist = anchor_dist
        # Try to find the starting anchor in the sequence to align the start
        # If not found, we start at anchor_dist and increment?
        # Better: We iterate and if we find a known station, we snap to it.
        # But we need a starting point if the first station is unknown.
        # Let's assume the provided anchor_id is the reference for the whole system.
        
        # Find if any station in the sequence already has a distance?
        # If so, use the first one found as the initial anchor.
        
        last_known_idx = -1
        last_known_dist = None
        
        # Pre-scan to find a valid starting anchor if possible
        for i, stop_id in enumerate(seq):
            if stop_id in station_dist:
                last_known_idx = i
                last_known_dist = station_dist[stop_id]
                break
        
        if last_known_dist is None:
            # No known stations. Use default anchor logic.
            # Try to find the requested anchor_id
            try:
                start_idx = seq.index(anchor_id)
                current_dist = anchor_dist
                # Backfill before anchor
                for i in range(start_idx - 1, -1, -1):
                    current_dist -= step
                    station_dist[seq[i]] = current_dist
                    _ROUTE_STATIONS[route_id].add(seq[i])
                
                # Fill after anchor
                current_dist = anchor_dist
                for i in range(start_idx, len(seq)):
                    station_dist[seq[i]] = current_dist
                    _ROUTE_STATIONS[route_id].add(seq[i])
                    current_dist += step
                return
            except ValueError:
                # Anchor not found and no known stations.
                # Just start at anchor_dist (arbitrary)
                current_dist = anchor_dist
                for stop_id in seq:
                    station_dist[stop_id] = current_dist
                    _ROUTE_STATIONS[route_id].add(stop_id)
                    current_dist += step
                return

        # We have a known starting point (last_known_idx, last_known_dist)
        # 1. Backfill from there
        curr = last_known_dist
        for i in range(last_known_idx - 1, -1, -1):
            curr -= step
            stop_id = seq[i]
            if stop_id not in station_dist:
                station_dist[stop_id] = curr
            _ROUTE_STATIONS[route_id].add(stop_id)
            
        # 2. Forward fill
        curr = last_known_dist
        _ROUTE_STATIONS[route_id].add(seq[last_known_idx])
        
        for i in range(last_known_idx + 1, len(seq)):
            stop_id = seq[i]
            if stop_id in station_dist:
                # Re-sync!
                curr = station_dist[stop_id]
            else:
                curr += step
                station_dist[stop_id] = curr
            _ROUTE_STATIONS[route_id].add(stop_id)

    # Process all routes
    for rid in routes:
        # Strip suffixes for alignment logic
        seq = [s[:-1] if len(s) > 3 and s[-1] in ['N', 'S'] else s for s in route_sequences[rid]]
        process_sequence(seq, route_id=rid, anchor_id='R17', anchor_dist=50, step=2)

    # Normalize
    if station_dist:
        min_dist = min(station_dist.values())
        max_dist = max(station_dist.values())
        dist_range = max_dist - min_dist
        if dist_range == 0: dist_range = 1
        
        for stop_id in station_dist:
            station_dist[stop_id] = ((station_dist[stop_id] - min_dist) / dist_range) * 200

    _STATION_MAP = station_dist
    
    # Build list for frontend (Global list, though we might not use it directly anymore)
    _STATIONS_LIST = []
    sorted_stops = sorted(station_dist.items(), key=lambda x: x[1])
    for stop_id, dist in sorted_stops:
        name = stops_info.get(stop_id, f"Unknown {stop_id}")
        _STATIONS_LIST.append({
            "id": stop_id,
            "name": name,
            "dist": round(dist, 1)
        })
        
    logger.info(f"Loaded {len(_STATIONS_LIST)} stations total.")

def get_station_distance(stop_id):
    # Handle suffixes
    if stop_id not in _STATION_MAP:
        if len(stop_id) > 3 and stop_id[-1] in ['N', 'S']:
            base_id = stop_id[:-1]
            return _STATION_MAP.get(base_id)
    return _STATION_MAP.get(stop_id)

def get_stations_list(route_id=None):
    if route_id and route_id in _ROUTE_STATIONS:
        # Filter by route
        relevant_stops = _ROUTE_STATIONS[route_id]
        filtered_list = [s for s in _STATIONS_LIST if s['id'] in relevant_stops]
        return filtered_list
    return _STATIONS_LIST
