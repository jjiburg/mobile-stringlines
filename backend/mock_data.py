import time
import random
import json
import math
from datetime import datetime, timedelta

# Mock stations for Q line (simplified)
STATIONS = [
    {"id": "Q05", "name": "96 St", "dist": 0},
    {"id": "Q04", "name": "86 St", "dist": 10},
    {"id": "Q03", "name": "72 St", "dist": 20},
    {"id": "57N", "name": "57 St-7 Av", "dist": 30},
    {"id": "49N", "name": "49 St", "dist": 35},
    {"id": "42N", "name": "Times Sq-42 St", "dist": 40},
    {"id": "34N", "name": "34 St-Herald Sq", "dist": 50},
    {"id": "28N", "name": "28 St", "dist": 55},
    {"id": "23N", "name": "23 St", "dist": 60},
    {"id": "14N", "name": "14 St-Union Sq", "dist": 70},
    {"id": "CAN", "name": "Canal St", "dist": 85},
    {"id": "DEK", "name": "DeKalb Av", "dist": 100},
    {"id": "ATL", "name": "Atlantic Av-Barclays Ctr", "dist": 110},
    {"id": "7AV", "name": "7 Av", "dist": 120},
    {"id": "PRO", "name": "Prospect Park", "dist": 130},
    {"id": "CHU", "name": "Church Av", "dist": 140},
    {"id": "KIN", "name": "Kings Hwy", "dist": 160},
    {"id": "CON", "name": "Coney Island-Stillwell Av", "dist": 200},
]

def generate_mock_data():
    now = time.time()
    trips = []
    
    # Generate 10 active trips
    for i in range(10):
        trip_id = f"mock_trip_{i}_{int(now)}"
        direction = random.choice([0, 1])
        
        # Random progress along the line
        progress = random.uniform(0, 200)
        
        # Generate history for this trip (last 60 minutes)
        history = []
        # Speed: approx 30 units per hour? No, let's say full line takes 60 mins.
        # 200 units / 60 mins = 3.33 units/min
        speed = 3.33 
        if direction == 1:
            speed = -speed
            
        current_dist = progress
        for t_offset in range(0, 60 * 60, 30): # Every 30 seconds backwards
            t = now - t_offset
            dist = current_dist - (speed * (t_offset / 60))
            
            if 0 <= dist <= 200:
                history.append({
                    "timestamp": t,
                    "distance": dist,
                    "stop_id": "MOCK"
                })
        
        if history:
            trips.append({
                "trip_id": trip_id,
                "route_id": "Q",
                "direction_id": direction,
                "positions": history
            })
            
    return trips

if __name__ == "__main__":
    data = generate_mock_data()
    print(json.dumps(data, indent=2))
