import csv
import os
from collections import defaultdict

GTFS_DIR = 'gtfs_subway'
TRIPS_FILE = os.path.join(GTFS_DIR, 'trips.txt')
STOP_TIMES_FILE = os.path.join(GTFS_DIR, 'stop_times.txt')

def main():
    print("Analyzing GTFS coverage by direction...")
    
    # 1. Map trips to route and direction
    trip_info = {} # trip_id -> (route_id, direction_id)
    route_directions = defaultdict(set) # route_id -> {0, 1}
    
    with open(TRIPS_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            trip_info[row['trip_id']] = (row['route_id'], row['direction_id'])
            route_directions[row['route_id']].add(row['direction_id'])
            
    # 2. Count stops per trip
    trip_stop_counts = defaultdict(int)
    with open(STOP_TIMES_FILE, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            trip_stop_counts[row['trip_id']] += 1
            
    # 3. Aggregate stats per route/direction
    stats = defaultdict(lambda: {'max_stops': 0, 'trip_count': 0}) # (route, dir) -> stats
    
    for trip_id, count in trip_stop_counts.items():
        if trip_id in trip_info:
            rid, did = trip_info[trip_id]
            s = stats[(rid, did)]
            s['trip_count'] += 1
            if count > s['max_stops']:
                s['max_stops'] = count
                
    # 4. Print results
    print(f"{'Route':<6} | {'Dir':<3} | {'Max Stops':<10} | {'Trip Count':<10}")
    print("-" * 40)
    
    sorted_keys = sorted(stats.keys())
    for rid, did in sorted_keys:
        s = stats[(rid, did)]
        print(f"{rid:<6} | {did:<3} | {s['max_stops']:<10} | {s['trip_count']:<10}")

if __name__ == "__main__":
    main()
