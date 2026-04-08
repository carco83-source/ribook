#!/usr/bin/env python3
"""
Fix listing status field for escrow testing
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / '.env')

async def fix_listing_status():
    # MongoDB connection
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    # Update all listings that have stato="disponibile" but no status field
    result = await db.listings.update_many(
        {"stato": "disponibile", "status": {"$exists": False}},
        {"$set": {"status": "available"}}
    )
    
    print(f"Updated {result.modified_count} listings with status='available'")
    
    # Also update any with stato="disponibile" and status=null
    result2 = await db.listings.update_many(
        {"stato": "disponibile", "status": None},
        {"$set": {"status": "available"}}
    )
    
    print(f"Updated {result2.modified_count} listings with null status")
    
    # Show current listings
    listings = await db.listings.find({}).to_list(10)
    print("\nCurrent listings:")
    for listing in listings:
        print(f"ID: {listing.get('id')}, stato: {listing.get('stato')}, status: {listing.get('status')}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_listing_status())