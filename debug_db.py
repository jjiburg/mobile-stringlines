import os
import sys
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from db import get_db, execute_query
import time

# Load config.env handled by shell

def main():
    print("Checking database content...")
    with get_db() as conn:
        # Check trips count by route
        cursor = execute_query(conn, "SELECT route_id, COUNT(*) as count FROM trips GROUP BY route_id")
        rows = cursor.fetchall()
        print("\nTrips per route:")
        for row in rows:
            # Handle both sqlite (tuple/Row) and postgres (dict)
            if isinstance(row, dict):
                print(f"  {row['route_id']}: {row['count']}")
            else:
                print(f"  {row['route_id']}: {row['count']}")

        # Check positions count by route (via join)
        cursor = execute_query(conn, """
            SELECT t.route_id, COUNT(*) as count 
            FROM positions p 
            JOIN trips t ON p.trip_id = t.trip_id 
            GROUP BY t.route_id
        """)
        rows = cursor.fetchall()
        print("\nPositions per route:")
        for row in rows:
            if isinstance(row, dict):
                print(f"  {row['route_id']}: {row['count']}")
            else:
                print(f"  {row['route_id']}: {row['count']}")
                
        # Check recent positions (last 30 mins)
        now = time.time()
        cutoff = now - (30 * 60)
        cursor = execute_query(conn, """
            SELECT t.route_id, COUNT(*) as count, MAX(p.timestamp) as last_ts
            FROM positions p 
            JOIN trips t ON p.trip_id = t.trip_id 
            WHERE p.timestamp > ?
            GROUP BY t.route_id
        """, (cutoff,))
        rows = cursor.fetchall()
        print(f"\nRecent positions (last 30 mins) per route (cutoff={cutoff}):")
        print(f"{'Route':<6} | {'Count':<8} | {'Last Update (Ago)':<20}")
        print("-" * 40)
        for row in rows:
            if isinstance(row, dict):
                rid = row['route_id']
                count = row['count']
                last_ts = row['last_ts']
            else:
                rid = row['route_id'] # sqlite row can be indexed by name if row_factory set, but here assumes tuple? 
                # Actually execute_query uses whatever the conn provides. 
                # In db.py: psycopg2 returns tuples by default unless DictCursor.
                # sqlite returns tuples.
                # Let's assume tuple/index access if not dict.
                # Wait, earlier output showed dict-like usage? No, I handled both.
                # Let's match the loop logic below.
                pass 
                
            # Safely get values
            if isinstance(row, dict):
                rid = row['route_id']
                count = row['count']
                last_ts = row['last_ts']
            else:
                rid = row[0]
                count = row[1]
                last_ts = row[2]
            
            ago = int(now - last_ts)
            print(f"{rid:<6} | {count:<8} | {ago}s ago")

if __name__ == "__main__":
    main()
