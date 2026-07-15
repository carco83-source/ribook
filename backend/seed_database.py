"""
Script per popolare il database con i dati iniziali (seed).
Viene eseguito all'avvio del server se il database è vuoto.
"""
import asyncio
import json
import os
import hashlib
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
SEED_DATA_PATH = os.path.join(os.path.dirname(__file__), "seed_data")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")  # Password admin da variabile d'ambiente

async def seed_collection(db, collection_name: str, file_name: str):
    """Popola una collection se è vuota."""
    collection = db[collection_name]
    count = await collection.count_documents({})
    
    if count > 0:
        print(f"  ✓ {collection_name}: già popolata ({count} documenti)")
        return False
    
    file_path = os.path.join(SEED_DATA_PATH, file_name)
    if not os.path.exists(file_path):
        print(f"  ✗ {collection_name}: file {file_name} non trovato")
        return False
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if not data:
            print(f"  - {collection_name}: file vuoto, skip")
            return False
        
        # Rimuovi _id per evitare conflitti
        for doc in data:
            if '_id' in doc:
                del doc['_id']
        
        # Inserisci in batch per performance
        batch_size = 1000
        total = len(data)
        inserted = 0
        
        for i in range(0, total, batch_size):
            batch = data[i:i + batch_size]
            await collection.insert_many(batch)
            inserted += len(batch)
            if total > batch_size:
                print(f"    Progresso: {inserted}/{total}")
        
        print(f"  ✓ {collection_name}: inseriti {total} documenti")
        return True
        
    except Exception as e:
        print(f"  ✗ {collection_name}: errore - {str(e)}")
        return False


async def seed_admin_user(db):
    """
    Crea l'utente admin se non esiste.
    La password viene letta dalla variabile d'ambiente ADMIN_PASSWORD.
    """
    print("\n👤 Verifica utente admin...")
    
    # Controlla se admin esiste già
    admin = await db.users.find_one({"email": "admin@ribook.it"})
    
    if admin:
        print("  ✓ Admin già esistente")
        return False
    
    # Verifica che ADMIN_PASSWORD sia configurata
    if not ADMIN_PASSWORD:
        print("  ⚠ ADMIN_PASSWORD non configurata - admin non creato")
        print("    Aggiungi ADMIN_PASSWORD al file .env o deploy.env")
        return False
    
    try:
        # Crea hash della password
        password_hash = hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()
        
        admin_doc = {
            "id": str(uuid.uuid4()),
            "email": "admin@ribook.it",
            "password_hash": password_hash,
            "nome": "Admin",
            "cognome": "RiBook",
            "is_admin": True,
            "created_at": "2026-01-01T00:00:00"
        }
        
        await db.users.insert_one(admin_doc)
        print(f"  ✓ Admin creato: admin@ribook.it")
        return True
        
    except Exception as e:
        print(f"  ✗ Errore creazione admin: {str(e)}")
        return False


async def create_indexes(db):
    """Crea gli indici necessari per le performance."""
    print("\n📑 Creazione indici...")
    
    try:
        # Books indexes
        await db.books.create_index("isbn")
        await db.books.create_index("titolo")
        await db.books.create_index([("titolo", "text"), ("autore", "text")])
        print("  ✓ Indici books creati")
        
        # Adozioni indexes
        await db.adozioni.create_index("codice_scuola")
        await db.adozioni.create_index("isbn")
        await db.adozioni.create_index([("codice_scuola", 1), ("classe", 1), ("sezione", 1)])
        print("  ✓ Indici adozioni creati")
        
        # Schools indexes
        await db.schools.create_index("codice_scuola", unique=True)
        await db.schools.create_index("nome")
        print("  ✓ Indici schools creati")
        
        # Listings indexes
        await db.listings.create_index("isbn")
        await db.listings.create_index("seller_id")
        await db.listings.create_index("status")
        print("  ✓ Indici listings creati")
        
    except Exception as e:
        print(f"  ⚠ Errore creazione indici: {str(e)}")

async def run_seed():
    """Esegue il seed del database."""
    print("\n" + "="*50)
    print("🌱 SEED DATABASE - RiBook")
    print("="*50)
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.ribook
    
    print(f"\n📦 Connesso a: {MONGO_URL}")
    print(f"📂 Seed data path: {SEED_DATA_PATH}")
    
    # Check if seed_data folder exists
    if not os.path.exists(SEED_DATA_PATH):
        print(f"\n⚠ Cartella seed_data non trovata!")
        print("  Il database rimarrà vuoto fino a quando non saranno importati i dati.")
        return
    
    print("\n📚 Popolamento collections...")
    
    # Seed collections in ordine
    collections_to_seed = [
        ("books", "books.json"),
        ("adozioni", "adozioni.json"),
        ("schools", "schools.json"),
        ("bookstores", "bookstores.json"),
    ]
    
    any_seeded = False
    for collection_name, file_name in collections_to_seed:
        result = await seed_collection(db, collection_name, file_name)
        if result:
            any_seeded = True
    
    # Crea utente admin se non esiste
    await seed_admin_user(db)
    
    # Crea indici se abbiamo inserito dati
    if any_seeded:
        await create_indexes(db)
    
    print("\n" + "="*50)
    print("✅ Seed completato!")
    print("="*50 + "\n")

if __name__ == "__main__":
    asyncio.run(run_seed())
