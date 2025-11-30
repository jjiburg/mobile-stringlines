import sqlite3
import os
import logging
from contextlib import contextmanager
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

# Configuration
DB_PATH = os.environ.get("DB_PATH", "subway.db")
DATABASE_URL = os.environ.get("DATABASE_URL")  # Prefer this (use Railway private URL via variable reference)
DATABASE_PUBLIC_URL = os.environ.get("DATABASE_PUBLIC_URL")  # Fallback for local/dev against public proxy
IS_RAILWAY = os.environ.get("RAILWAY_PROJECT_ID") is not None

# Pick the best available Postgres URL: private first, then public proxy
def get_db_url():
    if DATABASE_URL:
        return DATABASE_URL
    if IS_RAILWAY and DATABASE_PUBLIC_URL:
        return DATABASE_PUBLIC_URL
    if DATABASE_PUBLIC_URL:
        return DATABASE_PUBLIC_URL
    return None

logger = logging.getLogger(__name__)

def get_db_type():
    if get_db_url():
        return "postgres"
    return "sqlite"

def init_db():
    db_type = get_db_type()
    logger.info(f"Initializing database: {db_type}")
    
    if db_type == "sqlite":
        # Ensure directory exists
        db_dir = os.path.dirname(DB_PATH)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir)
            
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("PRAGMA journal_mode=WAL;")
            # SQLite Schema
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
            
    elif db_type == "postgres":
        if not psycopg2:
            raise ImportError("psycopg2 is required for Postgres but not installed.")
            
        with psycopg2.connect(get_db_url()) as conn:
            with conn.cursor() as cur:
                # Postgres Schema
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS trips (
                        trip_id TEXT PRIMARY KEY,
                        route_id TEXT,
                        start_time TEXT,
                        direction_id INTEGER
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS positions (
                        id SERIAL PRIMARY KEY,
                        trip_id TEXT,
                        timestamp DOUBLE PRECISION,
                        stop_id TEXT,
                        distance DOUBLE PRECISION,
                        FOREIGN KEY(trip_id) REFERENCES trips(trip_id)
                    )
                """)
                cur.execute("CREATE INDEX IF NOT EXISTS idx_positions_timestamp ON positions(timestamp)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_positions_trip_id ON positions(trip_id)")
            conn.commit()

@contextmanager
def get_db():
    db_type = get_db_type()
    
    if db_type == "sqlite":
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
            
    elif db_type == "postgres":
        conn = psycopg2.connect(get_db_url())
        try:
            yield conn
        finally:
            conn.close()

# Helper to execute query with correct placeholder
def execute_query(conn, query, params=()):
    db_type = get_db_type()
    
    if db_type == "sqlite":
        # SQLite uses ?
        cursor = conn.execute(query, params)
        return cursor
        
    elif db_type == "postgres":
        # Postgres uses %s
        # We need to convert ? to %s in the query string for compatibility
        pg_query = query.replace("?", "%s")
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(pg_query, params)
        return cursor
