"""
Script di backup per i dati critici di RiBook.

Esegui con: python backup_data.py

Crea un backup JSON di tutte le collezioni protette.
"""

import asyncio
import json
import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from protected_collections import PROTECTED_COLLECTIONS

async def backup_all():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.scambialibri
    
    # Crea directory backup
    backup_dir = f"/app/backups/backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    os.makedirs(backup_dir, exist_ok=True)
    
    print(f"=== BACKUP DATI RIBOOK ===")
    print(f"Directory: {backup_dir}")
    print(f"")
    
    for collection_name in PROTECTED_COLLECTIONS:
        try:
            collection = db[collection_name]
            docs = await collection.find({}).to_list(None)
            
            # Converti ObjectId in stringhe
            for doc in docs:
                if '_id' in doc:
                    doc['_id'] = str(doc['_id'])
                if 'created_at' in doc:
                    doc['created_at'] = str(doc['created_at'])
            
            # Salva in JSON
            filepath = f"{backup_dir}/{collection_name}.json"
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(docs, f, ensure_ascii=False, indent=2, default=str)
            
            print(f"✅ {collection_name}: {len(docs)} documenti")
        except Exception as e:
            print(f"❌ {collection_name}: Errore - {e}")
    
    print(f"")
    print(f"✅ Backup completato in: {backup_dir}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(backup_all())
