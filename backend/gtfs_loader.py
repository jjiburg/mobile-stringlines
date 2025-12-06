import csv
import os
import logging
from config import SUBWAY_DATA

logger = logging.getLogger(__name__)

GTFS_DIR = os.environ.get("GTFS_DIR", "gtfs_subway")
STOPS_FILE = os.path.join(GTFS_DIR, 'stops.txt')
TRIPS_FILE = os.path.join(GTFS_DIR, 'trips.txt')
STOP_TIMES_FILE = os.path.join(GTFS_DIR, 'stop_times.txt')

# _STATION_MAP = {} # DEPRECATED: Global map causes collisions
_ROUTE_STATION_MAP = {} # route_id -> {stop_id -> distance}
_ROUTE_STATIONS = {} # route_id -> set(stop_ids)
_STOPS_INFO = {} # stop_id -> stop_name

def load_data():
    global _ROUTE_STATION_MAP, _STATIONS_LIST, _ROUTE_STATIONS, _STOPS_INFO
    
    if not os.path.exists(GTFS_DIR):
        logger.error(f"GTFS directory {GTFS_DIR} not found!")
        return

    logger.info("Loading GTFS data...")
    
    # 1. Load Stops
    _STOPS_INFO = {}
    with open(STOPS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            _STOPS_INFO[row['stop_id']] = row['stop_name']

    # 2. Identify enabled routes from config
    enabled_routes = set()
    for division in SUBWAY_DATA.values():
        for line in division["lines"]:
            enabled_routes.add(line)
            
    # Also add 'GS' (Shuttle) and others if they appear in feeds but not explicitly listed? 
    # For now, let's stick to strict config or discover from routes.txt if valid.
    # Actually, let's load ALL routes from routes.txt but only process interesting ones if needed.
    # But sticking to the enabled_routes set is safer for now to avoid clutter.
    # Wait, 42 St Shuttle is 'GS'. Let's ensure it's in config or handled.
    # The config has 1-7. GS is often in the same feed. Let's add 'GS', 'FS', 'H' to the config if we want them?
    # The user request "all MTA subway lines" implies mainly the lettered/numbered ones.
    # Let's dynamically allow lines found in `routes.txt` if we want full coverage, 
    # but the config is good for the frontend grouping.
    
    routes_in_gtfs = []
    with open(os.path.join(GTFS_DIR, 'routes.txt'), 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rid = row['route_id']
            if rid not in ['SI']: # Exclude SIR
                routes_in_gtfs.append(rid)

    # 3. Find candidate trips (Longest for each route)
    # Store tuples of (trip_id, direction_id)
    candidate_trips = {r: [] for r in routes_in_gtfs}
    
    with open(TRIPS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rid = row['route_id']
            if rid in routes_in_gtfs:
                # Store trip_id AND direction_id
                candidate_trips[rid].append((row['trip_id'], row['direction_id']))
                
    # Limit candidates for performance
    all_candidate_trip_ids = set()
    for rid in routes_in_gtfs:
        # Take first 100
        for tid, _ in candidate_trips[rid][:100]:
            all_candidate_trip_ids.add(tid)
            
    # 4. Scan stop_times to find sequences
    trip_stops_map = {tid: [] for tid in all_candidate_trip_ids}
    with open(STOP_TIMES_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            tid = row['trip_id']
            if tid in all_candidate_trip_ids:
                trip_stops_map[tid].append((int(row['stop_sequence']), row['stop_id']))
                
    route_sequences = {}
    for rid in routes_in_gtfs:
        best_seq = []
        candidates = candidate_trips[rid][:100]
        
        for tid, direction_id in candidates:
            seq = trip_stops_map.get(tid, [])
            seq.sort() # Sort by stop_sequence
            stop_ids = [s[1] for s in seq]
            
            # Canonicalize direction:
            # We want uniform North -> South ordering (0 -> 100 on Y-axis).
            # Southbound trips (`direction_id=1`) normally go NorthStation -> SouthStation.
            # Northbound trips (`direction_id=0`) normally go SouthStation -> NorthStation.
            # If we find a Northbound trip is the longest, we must REVERSE it to match the North->South visual flow.
            if direction_id == '0':
                stop_ids.reverse()
                
            if len(stop_ids) > len(best_seq):
                best_seq = stop_ids
                
        route_sequences[rid] = best_seq
        logger.info(f"Route {rid}: Found sequence with {len(best_seq)} stops")

    # 5. Build per-route station maps
    _ROUTE_STATION_MAP = {} # route_id -> {stop_id -> distance}
    
    for rid in routes_in_gtfs:
        if rid not in route_sequences:
            continue
            
        # Strip suffixes for alignment logic
        seq = [s[:-1] if len(s) > 3 and s[-1] in ['N', 'S'] else s for s in route_sequences[rid]]
        
        # Create a FRESH station_dist for this route
        station_dist = {}
        
        # We use a simple spacing strategy relative to the start of the sequence.
        # Since we canonicalized the sequence to be North->South, we can just assign increasing distances.
        # Ideally, we would anchor to real lat/lon or a shared anchor (like 42 St), 
        # but relative spacing is sufficient for the stringline graph "topological" view.
        
        current_dist = 0
        step = 2
        
        # Try to anchor 'R17' (34 St-Herald Sq) or '631' (Grand Central) or '127' (Times Sq) - 42nd St corridor?
        # Actually, simple 0..100 normalization per line works well enough for independent charts.
        # The user looks at one line at a time.
        
        for stop_id in seq:
            station_dist[stop_id] = current_dist
            current_dist += step
            
        # Normalize to 0-200 range (arbitrary chart units)
        if station_dist:
            min_dist = min(station_dist.values())
            max_dist = max(station_dist.values())
            dist_range = max_dist - min_dist
            if dist_range == 0: dist_range = 1
            
            for stop_id in station_dist:
                station_dist[stop_id] = ((station_dist[stop_id] - min_dist) / dist_range) * 200
        
        _ROUTE_STATION_MAP[rid] = station_dist

    # Check loaded stats
    total_stations = sum(len(m) for m in _ROUTE_STATION_MAP.values())
    logger.info(f"Loaded {len(_ROUTE_STATION_MAP)} route maps with {total_stations} total entries.")

def get_station_distance(stop_id, route_id):
    """
    Get distance for a stop within a specific route's context.
    """
    if not route_id or route_id not in _ROUTE_STATION_MAP:
        return None
        
    route_map = _ROUTE_STATION_MAP[route_id]
    
    # Direct match
    if stop_id in route_map:
        return route_map[stop_id]
        
    # Handle suffixes (N/S)
    if len(stop_id) > 3 and stop_id[-1] in ['N', 'S']:
        base_id = stop_id[:-1]
        return route_map.get(base_id)
            
    return None

def get_stations_list(route_id=None):
    """
    Return list of stations with distances for a specific route.
    """
    if route_id and route_id in _ROUTE_STATION_MAP:
        route_map = _ROUTE_STATION_MAP[route_id]
        
        stops = []
        for stop_id, dist in route_map.items():
            stops.append({
                "id": stop_id,
                "name": _STOPS_INFO.get(stop_id, f"Unknown {stop_id}"),
                "dist": round(dist, 1)
            })
        stops.sort(key=lambda x: x['dist'])
        return stops
        
    return []

def get_terminal_stations(route_id):
    """Returns a set of stop_ids that are terminals (start/end) for the route."""
    stations = get_stations_list(route_id)
    if not stations:
        return set()
    
    terminals = set()
    if stations:
        terminals.add(stations[0]['id'])
        terminals.add(stations[-1]['id'])
        
    return terminals
