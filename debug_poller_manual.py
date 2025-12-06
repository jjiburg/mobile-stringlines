import sys
import os
import logging
import time

sys.path.append(os.path.join(os.getcwd(), 'backend'))

# Mock DB to avoid messing with prod if needed, but we want to test prod insert
# So we use real DB.
from db import get_db, execute_query
import gtfs_loader
from poller import fetch_feed, process_feed, FEED_URLS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    print("Loading GTFS data...")
    gtfs_loader.load_data()
    
    print("Starting manual poll cycle...")
    for url in FEED_URLS:
        print(f"Fetching {url}...")
        try:
            feed = fetch_feed(url)
            if feed:
                print(f"Processing {url} with {len(feed.entity)} entities...")
                process_feed(feed)
                print(f"Finished processing {url}")
            else:
                print(f"No feed content for {url}")
        except Exception as e:
            print(f"Error processing {url}: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    main()
