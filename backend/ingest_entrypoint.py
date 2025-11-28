import asyncio
import logging
import os
import sys

# Add backend directory to path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db import init_db
from poller import poll_loop
import gtfs_loader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def main():
    logger.info("Starting Ingestor Service...")
    
    # Initialize DB
    init_db()
    
    # Load GTFS data (needed for distance calculations in poller)
    gtfs_loader.load_data()
    
    # Start polling loop
    await poll_loop()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Ingestor stopped by user.")
    except Exception as e:
        logger.error(f"Ingestor failed: {e}")
        sys.exit(1)
