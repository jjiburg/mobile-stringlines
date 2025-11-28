import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", "subway.db")

def init_db():
    # Ensure directory exists
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir)
        
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trips (
                trip_id TEXT PRIMARY KEY,
                route_id TEXT,
                start_time TEXT,
                direction_id INTEGER
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id TEXT,
                timestamp REAL,
                stop_id TEXT,
                distance REAL,
                FOREIGN KEY(trip_id) REFERENCES trips(trip_id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_positions_timestamp ON positions(timestamp)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_positions_trip_id ON positions(trip_id)")

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
