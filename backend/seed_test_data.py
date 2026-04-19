"""
Script per popolare il database con dati di test realistici.
Crea 20 utenti con profili figli e 50+ libri in vendita.
USA ISBN REALI dalle adozioni del database.
"""

import asyncio
import uuid
import random
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

# Nomi realistici italiani
NOMI_GENITORI = [
    ("Marco", "Rossi"), ("Giulia", "Bianchi"), ("Alessandro", "Romano"), 
    ("Francesca", "Colombo"), ("Luca", "Ricci"), ("Sara", "Marino"),
    ("Matteo", "Greco"), ("Valentina", "Bruno"), ("Andrea", "Gallo"),
    ("Chiara", "Conti"), ("Davide", "De Luca"), ("Elena", "Mancini"),
    ("Federico", "Costa"), ("Alessia", "Giordano"), ("Simone", "Rizzo"),
    ("Martina", "Lombardi"), ("Lorenzo", "Moretti"), ("Giorgia", "Barbieri"),
    ("Stefano", "Fontana"), ("Anna", "Santoro")
]

NOMI_FIGLI = [
    "Sofia", "Leonardo", "Giulia", "Francesco", "Aurora", "Alessandro",
    "Emma", "Lorenzo", "Ginevra", "Matteo", "Beatrice", "Tommaso",
    "Alice", "Edoardo", "Vittoria", "Riccardo", "Chiara", "Andrea",
    "Greta", "Gabriele", "Martina", "Pietro", "Sara", "Niccolò"
]

SEZIONI = ["A", "B", "C", "D", "E"]
CONDIZIONI = ["come_nuovo", "ottime_condizioni", "buono", "buono", "ottime_condizioni"]

async def get_libri_reali(db):
    """Recupera libri REALI dalle adozioni del database"""
    libri_per_scuola = {}
    
    async for adozione in db.adozioni.find({}):
        codice = adozione.get('codice_scuola', '')
        nome_scuola = adozione.get('nome_scuola', codice)
        tipo = adozione.get('tipo_scuola', 'primo_grado')
        classe = adozione.get('classe', 1)
        
        if codice not in libri_per_scuola:
            libri_per_scuola[codice] = {
                'nome': nome_scuola,
                'tipo': tipo,
                'libri': []
            }
        
        for libro in adozione.get('libri', []):
            isbn = libro.get('isbn')
            if isbn and len(isbn) >= 10:
                prezzo = libro.get('prezzo_copertina', 20)
                if isinstance(prezzo, str):
                    try:
                        prezzo = float(prezzo.replace(',', '.').replace('€', '').strip())
                    except:
                        prezzo = 20.0
                
                libri_per_scuola[codice]['libri'].append({
                    'isbn': isbn,
                    'titolo': libro.get('titolo', 'N/A'),
                    'autori': libro.get('autori', 'N/A'),
                    'editore': libro.get('editore', 'N/A'),
                    'disciplina': libro.get('disciplina', 'N/A'),
                    'prezzo': prezzo,
                    'classe': classe
                })
    
    return libri_per_scuola

async def create_test_data():
    client = AsyncIOMotorClient(os.getenv('MONGO_URL'))
    db_name = os.getenv('DB_NAME', 'scambialibri')
    db = client[db_name]
    
    print(f"🚀 Inizio creazione dati di test nel database '{db_name}'...")
    
    # Prima recupera libri reali dal DB
    print("📖 Recupero libri reali dalle adozioni...")
    libri_per_scuola = await get_libri_reali(db)
    scuole_con_libri = [k for k, v in libri_per_scuola.items() if len(v['libri']) > 3]
    print(f"   Trovate {len(scuole_con_libri)} scuole con libri")
    
    if not scuole_con_libri:
        print("❌ Nessuna scuola con libri trovata! Impossibile creare listings.")
        client.close()
        return
    
    # Elimina dati esistenti di test
    await db.users.delete_many({"email": {"$regex": "@test.it$"}})
    await db.profiles.delete_many({"user_id": {"$nin": ["58ac430d-da2a-4954-bb2f-feea6de1f30c"]}})
    await db.listings.delete_many({"seller_email": {"$regex": "@test.it$"}})
    
    users_created = []
    all_listings = []
    
    # Crea 20 utenti
    for i, (nome, cognome) in enumerate(NOMI_GENITORI):
        user_id = str(uuid.uuid4())
        email = f"{nome.lower()}.{cognome.lower()}{random.randint(1,99)}@test.it"
        
        user = {
            "user_id": user_id,
            "email": email,
            "nome": nome,
            "cognome": cognome,
            "password_hash": "test_hash_" + user_id[:8],
            "is_premium": random.choice([True, False, False]),
            "created_at": datetime.utcnow() - timedelta(days=random.randint(1, 180)),
            "last_login": datetime.utcnow() - timedelta(hours=random.randint(1, 72)),
            "phone": f"+39 3{random.randint(20,99)} {random.randint(100,999)} {random.randint(1000,9999)}",
            "city": "Catanzaro",
            "province": "CZ"
        }
        
        await db.users.insert_one(user)
        
        # Crea 1-2 figli per utente, associati a scuole con libri
        num_figli = random.randint(1, 2)
        children = []
        
        for j in range(num_figli):
            child_id = str(uuid.uuid4())
            nome_figlio = random.choice(NOMI_FIGLI)
            
            # Scegli una scuola che ha libri
            codice_scuola = random.choice(scuole_con_libri)
            scuola_info = libri_per_scuola[codice_scuola]
            
            # Classe 2-3 per medie, 2-5 per superiori (così hanno libri da vendere)
            if scuola_info['tipo'] == 'primo_grado':
                classe = random.randint(2, 3)
            else:
                classe = random.randint(2, 5)
            
            sezione = random.choice(SEZIONI)
            
            child = {
                "id": child_id,
                "nome_figlio": nome_figlio,
                "codice_scuola": codice_scuola,
                "nome_scuola": scuola_info['nome'],
                "tipo_scuola": scuola_info['tipo'],
                "classe": classe,
                "sezione": sezione,
                "anno_scolastico": "2025/2026"
            }
            children.append(child)
        
        profile = {
            "user_id": user_id,
            "children": children
        }
        
        await db.profiles.insert_one(profile)
        users_created.append({"user": user, "children": children, "scuole": libri_per_scuola})
        print(f"  ✅ Utente {i+1}/20: {nome} {cognome} - {num_figli} figli")
    
    print(f"\n📚 Creazione libri in vendita con ISBN REALI...")
    
    # Crea 55 listings con ISBN REALI
    listing_count = 0
    target_listings = 55
    
    for user_data in users_created:
        if listing_count >= target_listings:
            break
            
        user = user_data["user"]
        children = user_data["children"]
        
        for child in children:
            if listing_count >= target_listings:
                break
            
            codice_scuola = child["codice_scuola"]
            scuola_libri = libri_per_scuola.get(codice_scuola, {}).get('libri', [])
            
            # Filtra libri di classi precedenti (che potrebbero vendere)
            libri_vendibili = [l for l in scuola_libri if l['classe'] < child['classe']]
            
            if not libri_vendibili:
                # Fallback: usa qualsiasi libro della scuola
                libri_vendibili = scuola_libri[:10]
            
            if not libri_vendibili:
                continue
            
            # 2-4 libri per figlio
            num_libri = min(random.randint(2, 4), len(libri_vendibili))
            libri_selezionati = random.sample(libri_vendibili, num_libri)
            
            for libro in libri_selezionati:
                if listing_count >= target_listings:
                    break
                
                prezzo_vendita = round(libro['prezzo'] * random.uniform(0.4, 0.6), 2)
                
                listing = {
                    "id": str(uuid.uuid4()),
                    "seller_id": user["user_id"],
                    "seller_name": f"{user['nome']} {user['cognome'][:1]}.",
                    "seller_email": user["email"],
                    "child_id": child["id"],
                    "child_name": child["nome_figlio"],
                    "book_isbn": libro["isbn"],
                    "book_title": libro["titolo"],
                    "book_author": libro["autori"],
                    "book_publisher": libro["editore"],
                    "book_subject": libro["disciplina"],
                    "book_class": libro["classe"],
                    "school_code": child["codice_scuola"],
                    "school_name": child["nome_scuola"],
                    "school_type": child["tipo_scuola"],
                    "condition": random.choice(CONDIZIONI),
                    "price": prezzo_vendita,
                    "original_price": libro["prezzo"],
                    "description": random.choice([
                        "Libro in ottime condizioni, usato con cura.",
                        "Qualche segno di usura ma perfettamente leggibile.",
                        "Come nuovo, utilizzato pochissimo.",
                        "Buone condizioni, alcune sottolineature a matita.",
                        "Perfetto stato, copertina integra."
                    ]),
                    "photos": [],
                    "status": "available",
                    "created_at": datetime.utcnow() - timedelta(days=random.randint(1, 30)),
                    "updated_at": datetime.utcnow(),
                    "views": random.randint(0, 50),
                    "interested_count": random.randint(0, 5)
                }
                
                await db.listings.insert_one(listing)
                all_listings.append(listing)
                listing_count += 1
    
    print(f"\n✅ Completato!")
    print(f"   - {len(users_created)} utenti creati")
    print(f"   - {listing_count} libri in vendita (con ISBN REALI)")
    
    # Verifica ISBN comuni
    isbn_listings = set(l['book_isbn'] for l in all_listings)
    isbn_adozioni = set()
    async for adozione in db.adozioni.find({}):
        for l in adozione.get('libri', []):
            isbn_adozioni.add(l.get('isbn'))
    
    comuni = isbn_listings.intersection(isbn_adozioni)
    print(f"   - {len(comuni)} ISBN in comune con le adozioni ✅")
    
    # Statistiche
    print(f"\n📊 Statistiche per scuola:")
    scuole_stats = {}
    for listing in all_listings:
        scuola = listing.get('school_name', 'N/A')
        scuole_stats[scuola] = scuole_stats.get(scuola, 0) + 1
    
    for scuola, count in sorted(scuole_stats.items(), key=lambda x: -x[1])[:10]:
        print(f"   - {scuola[:40]}: {count} libri")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_test_data())
