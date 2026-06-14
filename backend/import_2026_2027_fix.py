import asyncio
import csv
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime
import uuid
from dotenv import load_dotenv

load_dotenv()

# Configurazione scuole Catanzaro con mapping nomi -> codici meccanografici
SCUOLE_CATANZARO = {
    # SCUOLE MEDIE
    "medie": [
        {"codice": "CZMM00300E", "nome": "Convitto Nazionale P. Galluppi", "tipo": "MM", "has_books_2026": True},
        {"codice": "CZMM85201Q", "nome": "IC Patari-Rodari-Pascoli-Aldisio", "tipo": "MM", "has_books_2026": True},
        {"codice": "CZMM856013", "nome": "IC Don Milani", "tipo": "MM", "has_books_2026": False},
        {"codice": "CZMM85801P", "nome": "IC Mater Domini Nord Est Manzoni", "tipo": "MM", "has_books_2026": True},
        {"codice": "CZMM86001P", "nome": "IC Casalinuovo Sud", "tipo": "MM", "has_books_2026": True},
        {"codice": "CZMM86701D", "nome": "IC V. Vivaldi", "tipo": "MM", "has_books_2026": True},
    ],
    # SCUOLE SUPERIORI
    "superiori": [
        {"codice": "CZPC09000X", "nome": "Liceo Classico P. Galluppi", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZPS00101C", "nome": "IIS Enrico Fermi - Liceo Scientifico", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZPS02201D", "nome": "Liceo Scientifico Luigi Siciliani", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZPM02201E", "nome": "Liceo Statale Giovanna De Nobili", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZPM00101D", "nome": "IIS Vittorio Emanuele II - Magistrale Cassiodoro", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZRI02401A", "nome": "IIS Petrucci-Ferraris-Maresca - IPSIA Ferraris", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZRC02401N", "nome": "IIS Petrucci-Ferraris-Maresca - IPSCT Sorace Maresca", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZTL02401B", "nome": "IIS Petrucci-Ferraris-Maresca - ITG Petrucci", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZTA021035", "nome": "Istituto Tecnico Agrario V. Emanuele II", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZTD024011", "nome": "Istituto Tecnico Commerciale Grimaldi-Pacioli", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZTF010008", "nome": "Istituto Tecnico Tecnologico Scalfaro", "tipo": "NT", "has_books_2026": False},
        {"codice": "CZTE021011", "nome": "Istituto Tecnico Tecnologico B. Chimirri", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZSL02201A", "nome": "Liceo Artistico", "tipo": "NT", "has_books_2026": True},
    ]
}

async def import_data():
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "scambialibri")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("=" * 70)
    print(f"📚 IMPORTAZIONE DATI 2026/2027 - DATABASE: {db_name}")
    print("=" * 70)
    
    # 1. Reset completo delle collezioni transazionali
    print("\n🔄 FASE 0: Reset collezioni transazionali")
    print("-" * 50)
    
    collections_to_clear = [
        "listings", "orders", "notifications", "requests",
        "messages", "conversations", "chat_messages", "reports",
        "bookstore_requests", "bookstore_notifications", "cart_items"
    ]
    
    for coll_name in collections_to_clear:
        try:
            count = await db[coll_name].count_documents({})
            result = await db[coll_name].delete_many({})
            print(f"  ✅ {coll_name}: eliminati {result.deleted_count}/{count}")
        except Exception as e:
            print(f"  ⚠️ {coll_name}: {e}")
    
    # Reset contatori utenti
    await db.users.update_many({}, {"$set": {
        "libri_venduti": 0, "libri_acquistati": 0,
        "guadagno_totale": 0, "risparmio_totale": 0,
        "unread_notifications": 0
    }})
    print("  ✅ users: contatori resettati")
    
    # 2. Aggiornare/sostituire collezione schools
    print("\n📍 FASE 1: Aggiornamento collezione SCHOOLS")
    print("-" * 50)
    
    # Svuota la collezione schools
    await db.schools.delete_many({})
    
    schools_to_insert = []
    all_school_codes = []
    
    for categoria, scuole in SCUOLE_CATANZARO.items():
        for scuola in scuole:
            school_doc = {
                "id": str(uuid.uuid4()),
                "codice": scuola["codice"],  # Uso "codice" per compatibilità
                "codice_meccanografico": scuola["codice"],
                "nome": scuola["nome"],
                "tipo": "Media" if categoria == "medie" else "Superiore",
                "tipo_grado": scuola["tipo"],
                "comune": "Catanzaro",
                "provincia": "CZ",
                "has_books_2026": scuola["has_books_2026"],
                "anno_scolastico": "2026/2027",
                "created_at": datetime.utcnow().isoformat()
            }
            schools_to_insert.append(school_doc)
            all_school_codes.append(scuola["codice"])
            status = "✅" if scuola["has_books_2026"] else "⚠️ (no libri 2026)"
            print(f"  {status} {scuola['nome']} ({scuola['codice']})")
    
    if schools_to_insert:
        await db.schools.insert_many(schools_to_insert)
    print(f"\n  📊 Inserite {len(schools_to_insert)} scuole")
    
    # 3. Importare libri dal CSV 2026/2027
    print("\n📖 FASE 2: Importazione LIBRI da CSV 2026/2027")
    print("-" * 50)
    
    csv_file = "adozioni_calabria.csv"
    
    # Svuota le collezioni dei libri
    await db.adozioni.delete_many({})
    await db.books.delete_many({})
    
    adozioni_to_insert = []
    books_unique = {}
    
    with open(csv_file, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            codice_scuola = row.get('CODICESCUOLA', '')
            
            if codice_scuola not in all_school_codes:
                continue
            
            isbn = row.get('CODICEISBN', '').strip()
            if not isbn:
                continue
            
            try:
                prezzo_str = row.get('PREZZO', '0').replace(',', '.')
                prezzo_float = float(prezzo_str)
            except:
                prezzo_float = 0.0
            
            adozione = {
                "id": str(uuid.uuid4()),
                "codice_scuola": codice_scuola,
                "anno_corso": row.get('ANNOCORSO', ''),
                "sezione": row.get('SEZIONEANNO', ''),
                "tipo_grado": row.get('TIPOGRADOSCUOLA', ''),
                "combinazione": row.get('COMBINAZIONE', ''),
                "disciplina": row.get('DISCIPLINA', ''),
                "isbn": isbn,
                "autori": row.get('AUTORI', '').strip(),
                "titolo": row.get('TITOLO', '').strip(),
                "sottotitolo": row.get('SOTTOTITOLO', '').strip(),
                "volume": row.get('VOLUME', ''),
                "editore": row.get('EDITORE', '').strip(),
                "prezzo": prezzo_str,
                "prezzo_copertina": prezzo_float,
                "nuova_adozione": row.get('NUOVAADOZ', '') == 'Si',
                "da_acquistare": row.get('DAACQUIST', '') == 'Si',
                "consigliato": row.get('CONSIGLIATO', '') == 'Si',
                "anno_scolastico": "2026/2027",
                "created_at": datetime.utcnow().isoformat()
            }
            adozioni_to_insert.append(adozione)
            
            if isbn not in books_unique:
                books_unique[isbn] = {
                    "id": str(uuid.uuid4()),
                    "isbn": isbn,
                    "titolo": row.get('TITOLO', '').strip(),
                    "sottotitolo": row.get('SOTTOTITOLO', '').strip(),
                    "autori": row.get('AUTORI', '').strip(),
                    "editore": row.get('EDITORE', '').strip(),
                    "prezzo_copertina": prezzo_float,
                    "volume": row.get('VOLUME', ''),
                    "disciplina": row.get('DISCIPLINA', ''),
                    "anno_scolastico": "2026/2027",
                    "created_at": datetime.utcnow().isoformat()
                }
    
    # Inserisci adozioni in batch
    if adozioni_to_insert:
        batch_size = 1000
        for i in range(0, len(adozioni_to_insert), batch_size):
            batch = adozioni_to_insert[i:i+batch_size]
            await db.adozioni.insert_many(batch)
            print(f"  📥 Adozioni {i+1} - {min(i+batch_size, len(adozioni_to_insert))}")
    
    print(f"\n  📊 Totale adozioni: {len(adozioni_to_insert)}")
    
    # Inserisci libri
    books_list = list(books_unique.values())
    if books_list:
        await db.books.insert_many(books_list)
    print(f"  📊 Totale libri unici: {len(books_list)}")
    
    # 4. Statistiche finali
    print("\n" + "=" * 70)
    print("📊 RIEPILOGO FINALE")
    print("=" * 70)
    
    print("\n📍 Adozioni per scuola:")
    for scuola in schools_to_insert:
        codice = scuola["codice"]
        count = await db.adozioni.count_documents({"codice_scuola": codice})
        status = "✅" if count > 0 else "⚠️"
        print(f"  {status} {scuola['nome']}: {count}")
    
    print("\n📍 Per grado:")
    mm = await db.adozioni.count_documents({"tipo_grado": "MM"})
    nt = await db.adozioni.count_documents({"tipo_grado": "NT"})
    print(f"  🎓 Medie (MM): {mm}")
    print(f"  🏛️ Superiori (NT): {nt}")
    
    print("\n" + "=" * 70)
    print("✅ IMPORTAZIONE COMPLETATA!")
    print("=" * 70)
    
    client.close()

if __name__ == "__main__":
    asyncio.run(import_data())
