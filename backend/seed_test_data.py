"""
Script per popolare il database con dati di test realistici.
Crea 20 utenti con profili figli e 50+ libri in vendita.
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

# Scuole di Catanzaro
SCUOLE_MEDIE = [
    {"codice": "CZMM86001P", "nome": "I.C. Casalinuovo", "tipo": "primo_grado"},
    {"codice": "CZMM856013", "nome": "I.C. Don Milani", "tipo": "primo_grado"},
    {"codice": "CZMM85201Q", "nome": "I.C. Patari - Rodari", "tipo": "primo_grado"},
    {"codice": "CZMM86701D", "nome": "I.C. Vivaldi", "tipo": "primo_grado"},
]

SCUOLE_SUPERIORI = [
    {"codice": "CZPS00101C", "nome": "Liceo Scientifico E. Fermi", "tipo": "secondo_grado"},
    {"codice": "CZPC09000X", "nome": "Liceo Classico P. Galluppi", "tipo": "secondo_grado"},
    {"codice": "CZTF010008", "nome": "ITIS E. Scalfaro", "tipo": "secondo_grado"},
    {"codice": "CZTA021035", "nome": "IST. Tecnico Agrario V. Emanuele II", "tipo": "secondo_grado"},
]

SEZIONI = ["A", "B", "C", "D", "E"]
CONDIZIONI = ["come_nuovo", "ottime_condizioni", "buono", "buono", "ottime_condizioni"]

# Libri realistici con ISBN
LIBRI_MEDIE = [
    {"isbn": "9788805079100", "titolo": "Matematica Oggi Vol. 1", "autori": "Sasso L.", "editore": "Petrini", "disciplina": "MATEMATICA", "prezzo": 25.50, "classe": 1},
    {"isbn": "9788805079117", "titolo": "Matematica Oggi Vol. 2", "autori": "Sasso L.", "editore": "Petrini", "disciplina": "MATEMATICA", "prezzo": 26.00, "classe": 2},
    {"isbn": "9788805079124", "titolo": "Matematica Oggi Vol. 3", "autori": "Sasso L.", "editore": "Petrini", "disciplina": "MATEMATICA", "prezzo": 26.50, "classe": 3},
    {"isbn": "9788842112358", "titolo": "Epica e Mito", "autori": "Biglia P.", "editore": "Paravia", "disciplina": "ITALIANO", "prezzo": 18.90, "classe": 1},
    {"isbn": "9788869103810", "titolo": "Tecnomedia Plus", "autori": "Paci G.", "editore": "Zanichelli", "disciplina": "TECNOLOGIA", "prezzo": 32.00, "classe": 1},
    {"isbn": "9788808721013", "titolo": "Scienze Focus", "autori": "Leopardi L.", "editore": "DeAgostini", "disciplina": "SCIENZE", "prezzo": 24.50, "classe": 1},
    {"isbn": "9788808721020", "titolo": "Scienze Focus Vol. 2", "autori": "Leopardi L.", "editore": "DeAgostini", "disciplina": "SCIENZE", "prezzo": 25.00, "classe": 2},
    {"isbn": "9788839303486", "titolo": "Sulla Tua Parola", "autori": "Cassinotti C.", "editore": "Marietti", "disciplina": "RELIGIONE", "prezzo": 19.60, "classe": 1},
    {"isbn": "9788808220011", "titolo": "Get Thinking", "autori": "AA.VV.", "editore": "Cambridge", "disciplina": "INGLESE", "prezzo": 28.50, "classe": 1},
    {"isbn": "9788808220028", "titolo": "Get Thinking 2", "autori": "AA.VV.", "editore": "Cambridge", "disciplina": "INGLESE", "prezzo": 29.00, "classe": 2},
    {"isbn": "9788839303967", "titolo": "Attivi! Sport e Sane Abitudini", "autori": "Chiesa E.", "editore": "Marietti", "disciplina": "SCIENZE MOTORIE", "prezzo": 22.85, "classe": 1},
    {"isbn": "9788808799654", "titolo": "In Viaggio con la Storia Vol. 1", "autori": "Lunari M.", "editore": "Zanichelli", "disciplina": "STORIA", "prezzo": 28.30, "classe": 1},
    {"isbn": "9788808799661", "titolo": "In Viaggio con la Storia Vol. 2", "autori": "Lunari M.", "editore": "Zanichelli", "disciplina": "STORIA", "prezzo": 29.00, "classe": 2},
    {"isbn": "9788842115687", "titolo": "Geograficamente", "autori": "Bianchi S.", "editore": "DeAgostini", "disciplina": "GEOGRAFIA", "prezzo": 23.50, "classe": 1},
    {"isbn": "9788805070114", "titolo": "Arte e Immagine", "autori": "Dorfles G.", "editore": "Atlas", "disciplina": "ARTE", "prezzo": 31.00, "classe": 1},
]

LIBRI_SUPERIORI = [
    {"isbn": "9788805071012", "titolo": "Matematica.blu 1", "autori": "Bergamini M.", "editore": "Zanichelli", "disciplina": "MATEMATICA", "prezzo": 35.50, "classe": 1},
    {"isbn": "9788805071029", "titolo": "Matematica.blu 2", "autori": "Bergamini M.", "editore": "Zanichelli", "disciplina": "MATEMATICA", "prezzo": 37.25, "classe": 2},
    {"isbn": "9788805071234", "titolo": "Matematica.blu 3", "autori": "Bergamini M.", "editore": "Zanichelli", "disciplina": "MATEMATICA", "prezzo": 38.00, "classe": 3},
    {"isbn": "9788808349156", "titolo": "Chimica Più Verde Vol. Unico", "autori": "Posca V.", "editore": "Zanichelli", "disciplina": "CHIMICA", "prezzo": 38.90, "classe": 1},
    {"isbn": "9788808392022", "titolo": "Primo Comma Vol. B", "autori": "Faenza F.", "editore": "Zanichelli", "disciplina": "DIRITTO", "prezzo": 16.70, "classe": 2},
    {"isbn": "9788808648488", "titolo": "Agraria Vol. Unico", "autori": "Sammarone S.", "editore": "Zanichelli", "disciplina": "DISEGNO", "prezzo": 28.90, "classe": 1},
    {"isbn": "9788808720276", "titolo": "Fisica: Lezioni e Problemi Vol. U", "autori": "Ruffo G.", "editore": "Zanichelli", "disciplina": "FISICA", "prezzo": 40.60, "classe": 2},
    {"isbn": "9788805079919", "titolo": "Promessi Sposi", "autori": "Manzoni A.", "editore": "SEI", "disciplina": "ITALIANO", "prezzo": 25.80, "classe": 2},
    {"isbn": "9788849424737", "titolo": "Costruttori di Sogni", "autori": "Geroni N.", "editore": "Petrini", "disciplina": "ITALIANO", "prezzo": 22.45, "classe": 2},
    {"isbn": "9788869106675", "titolo": "Le Parole Sono Idee", "autori": "Serianni L.", "editore": "Mondadori", "disciplina": "ITALIANO", "prezzo": 30.90, "classe": 1},
    {"isbn": "9788858346303", "titolo": "Get Thinking Second Edition", "autori": "AA.VV.", "editore": "Cambridge", "disciplina": "INGLESE", "prezzo": 34.90, "classe": 1},
    {"isbn": "9788848264754", "titolo": "Terra e Techne", "autori": "Lapadula M.", "editore": "Poseidonia", "disciplina": "TECNOLOGIA", "prezzo": 30.70, "classe": 1},
    {"isbn": "9788837913793", "titolo": "Scienze Integrate", "autori": "Boccardi M.", "editore": "Cappelli", "disciplina": "SCIENZE", "prezzo": 25.00, "classe": 1},
    {"isbn": "9788842112345", "titolo": "Lingua Latina 1", "autori": "Flocchini N.", "editore": "Bompiani", "disciplina": "LATINO", "prezzo": 32.00, "classe": 1},
    {"isbn": "9788842112399", "titolo": "Greco Antico 1", "autori": "Campanini C.", "editore": "Sansoni", "disciplina": "GRECO", "prezzo": 35.00, "classe": 1},
    {"isbn": "9788823356789", "titolo": "Economia Aziendale 1", "autori": "Astolfi E.", "editore": "Tramontana", "disciplina": "ECONOMIA", "prezzo": 28.50, "classe": 1},
]

async def create_test_data():
    client = AsyncIOMotorClient(os.getenv('MONGO_URL'))
    db = client.school_books_marketplace
    
    print("🚀 Inizio creazione dati di test...")
    
    # Prima elimina dati esistenti di test (ma mantieni l'utente principale)
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
        
        # Crea 1-3 figli per utente
        num_figli = random.randint(1, 3)
        children = []
        
        for j in range(num_figli):
            child_id = str(uuid.uuid4())
            nome_figlio = random.choice(NOMI_FIGLI)
            
            # Scegli scuola
            if random.random() < 0.5:
                scuola = random.choice(SCUOLE_MEDIE)
                classe = random.randint(2, 3)  # 2-3 per avere libri da vendere
            else:
                scuola = random.choice(SCUOLE_SUPERIORI)
                classe = random.randint(2, 5)
            
            sezione = random.choice(SEZIONI)
            
            child = {
                "id": child_id,
                "nome_figlio": nome_figlio,
                "codice_scuola": scuola["codice"],
                "nome_scuola": scuola["nome"],
                "tipo_scuola": scuola["tipo"],
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
        users_created.append({"user": user, "children": children})
        print(f"  ✅ Utente {i+1}/20: {nome} {cognome} - {num_figli} figli")
    
    print(f"\n📚 Creazione libri in vendita...")
    
    # Crea 55 listings
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
            
            # Seleziona libri in base al tipo di scuola
            if child["tipo_scuola"] == "primo_grado":
                libri_disponibili = [l for l in LIBRI_MEDIE if l["classe"] < child["classe"]]
            else:
                libri_disponibili = [l for l in LIBRI_SUPERIORI if l["classe"] < child["classe"]]
            
            if not libri_disponibili:
                continue
            
            # 2-4 libri per figlio
            num_libri = min(random.randint(2, 4), len(libri_disponibili))
            libri_selezionati = random.sample(libri_disponibili, num_libri)
            
            for libro in libri_selezionati:
                if listing_count >= target_listings:
                    break
                
                prezzo_vendita = round(libro["prezzo"] * random.uniform(0.4, 0.6), 2)
                
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
    print(f"   - {listing_count} libri in vendita")
    
    # Statistiche
    print(f"\n📊 Statistiche per scuola:")
    scuole_stats = {}
    for listing in all_listings:
        scuola = listing.get('school_name', 'N/A')
        scuole_stats[scuola] = scuole_stats.get(scuola, 0) + 1
    
    for scuola, count in sorted(scuole_stats.items(), key=lambda x: -x[1]):
        print(f"   - {scuola}: {count} libri")
    
    print(f"\n📖 Statistiche per materia:")
    materie_stats = {}
    for listing in all_listings:
        materia = listing.get('book_subject', 'N/A')
        materie_stats[materia] = materie_stats.get(materia, 0) + 1
    
    for materia, count in sorted(materie_stats.items(), key=lambda x: -x[1]):
        print(f"   - {materia}: {count} libri")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_test_data())
