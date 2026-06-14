import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

async def reset_database():
    """
    Reset del database RiBook per preparare l'importazione libri 2026/2027
    Mantiene: users, schools, books, adozioni, bookstores
    Elimina: listings, orders, notifications, requests, messages, conversations, chat_messages, reports
    """
    
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_url)
    db = client.ribook
    
    print("=" * 60)
    print("🔄 RESET DATABASE RIBOOK")
    print("=" * 60)
    
    # Collezioni da svuotare completamente
    collections_to_clear = [
        "listings",           # Annunci di vendita
        "orders",             # Ordini/transazioni
        "notifications",      # Notifiche
        "requests",           # Richieste libri
        "messages",           # Messaggi chat
        "conversations",      # Conversazioni
        "chat_messages",      # Messaggi chat (altra collezione)
        "reports",            # Segnalazioni
    ]
    
    for collection_name in collections_to_clear:
        try:
            count_before = await db[collection_name].count_documents({})
            result = await db[collection_name].delete_many({})
            print(f"✅ {collection_name}: eliminati {result.deleted_count} documenti (erano {count_before})")
        except Exception as e:
            print(f"⚠️ {collection_name}: errore - {e}")
    
    print("\n" + "=" * 60)
    print("🔄 RESET CONTATORI UTENTI")
    print("=" * 60)
    
    # Reset contatori negli utenti
    try:
        result = await db.users.update_many(
            {},
            {
                "$set": {
                    "libri_venduti": 0,
                    "libri_acquistati": 0,
                    "guadagno_totale": 0,
                    "risparmio_totale": 0,
                    "valutazione_media": 0,
                    "numero_valutazioni": 0,
                    "unread_notifications": 0,
                }
            }
        )
        print(f"✅ users: resettati contatori per {result.modified_count} utenti")
    except Exception as e:
        print(f"⚠️ users: errore reset contatori - {e}")
    
    print("\n" + "=" * 60)
    print("📊 STATO COLLEZIONI MANTENUTE")
    print("=" * 60)
    
    # Collezioni mantenute
    maintained_collections = ["users", "schools", "books", "adozioni", "bookstores"]
    for collection_name in maintained_collections:
        try:
            count = await db[collection_name].count_documents({})
            print(f"📚 {collection_name}: {count} documenti mantenuti")
        except Exception as e:
            print(f"⚠️ {collection_name}: errore - {e}")
    
    print("\n" + "=" * 60)
    print("✅ RESET COMPLETATO!")
    print("=" * 60)
    
    client.close()

if __name__ == "__main__":
    asyncio.run(reset_database())
