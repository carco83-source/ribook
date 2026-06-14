import asyncio
import csv
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime
import uuid

# Configurazione scuole Catanzaro con mapping nomi -> codici meccanografici
SCUOLE_CATANZARO = {
    # SCUOLE MEDIE
    "medie": [
        {"codice": "CZMM00300E", "nome": "Convitto Nazionale P. Galluppi", "tipo": "MM", "has_books_2026": True},
        {"codice": "CZMM85201Q", "nome": "IC Patari-Rodari-Pascoli-Aldisio", "tipo": "MM", "has_books_2026": True},
        {"codice": "CZMM856013", "nome": "IC Don Milani", "tipo": "MM", "has_books_2026": False},  # Manca nel CSV 2026
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
        {"codice": "CZTF010008", "nome": "Istituto Tecnico Tecnologico Scalfaro", "tipo": "NT", "has_books_2026": False},  # Manca nel CSV 2026
        {"codice": "CZTE021011", "nome": "Istituto Tecnico Tecnologico B. Chimirri", "tipo": "NT", "has_books_2026": True},
        {"codice": "CZSL02201A", "nome": "Liceo Artistico", "tipo": "NT", "has_books_2026": True},
    ]
}

async def import_data():
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_url)
    db = client.ribook
    
    print("=" * 70)
    print("📚 IMPORTAZIONE DATI 2026/2027 - RIBOOK")
    print("=" * 70)
    
    # 1. Creare collezione schools
    print("\n📍 FASE 1: Creazione collezione SCHOOLS")
    print("-" * 50)
    
    schools_to_insert = []
    all_school_codes = []
    
    for categoria, scuole in SCUOLE_CATANZARO.items():
        for scuola in scuole:
            school_doc = {
                "id": str(uuid.uuid4()),
                "codice_meccanografico": scuola["codice"],
                "nome": scuola["nome"],
                "tipo": "media" if categoria == "medie" else "superiore",
                "tipo_grado": scuola["tipo"],
                "comune": "CATANZARO",
                "provincia": "CZ",
                "has_books_2026": scuola["has_books_2026"],
                "anno_scolastico": "2026/2027",
                "created_at": datetime.utcnow().isoformat()
            }
            schools_to_insert.append(school_doc)
            all_school_codes.append(scuola["codice"])
            print(f"  ✅ {scuola['nome']} ({scuola['codice']})")
    
    # Svuota e inserisci scuole
    await db.schools.delete_many({})
    if schools_to_insert:
        await db.schools.insert_many(schools_to_insert)
    print(f"\n  📊 Inserite {len(schools_to_insert)} scuole")
    
    # 2. Importare libri dal CSV 2026/2027
    print("\n📖 FASE 2: Importazione LIBRI da CSV 2026/2027")
    print("-" * 50)
    
    csv_file = "adozioni_calabria.csv"
    
    adozioni_to_insert = []
    books_unique = {}  # Per evitare duplicati ISBN
    
    with open(csv_file, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            codice_scuola = row.get('CODICESCUOLA', '')
            
            # Filtra solo le scuole di Catanzaro
            if codice_scuola not in all_school_codes:
                continue
            
            isbn = row.get('CODICEISBN', '').strip()
            if not isbn:
                continue
            
            # Documento adozione
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
                "prezzo": row.get('PREZZO', '0').replace(',', '.'),
                "nuova_adozione": row.get('NUOVAADOZ', '') == 'Si',
                "da_acquistare": row.get('DAACQUIST', '') == 'Si',
                "consigliato": row.get('CONSIGLIATO', '') == 'Si',
                "anno_scolastico": "2026/2027",
                "created_at": datetime.utcnow().isoformat()
            }
            adozioni_to_insert.append(adozione)
            
            # Libro unico per ISBN
            if isbn not in books_unique:
                try:
                    prezzo_float = float(row.get('PREZZO', '0').replace(',', '.'))
                except:
                    prezzo_float = 0.0
                    
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
    
    # Svuota e inserisci adozioni
    await db.adozioni.delete_many({})
    if adozioni_to_insert:
        # Inserisci in batch per performance
        batch_size = 1000
        for i in range(0, len(adozioni_to_insert), batch_size):
            batch = adozioni_to_insert[i:i+batch_size]
            await db.adozioni.insert_many(batch)
            print(f"  📥 Inserite adozioni {i+1} - {min(i+batch_size, len(adozioni_to_insert))}")
    
    print(f"\n  📊 Totale adozioni inserite: {len(adozioni_to_insert)}")
    
    # Svuota e inserisci libri
    await db.books.delete_many({})
    books_list = list(books_unique.values())
    if books_list:
        await db.books.insert_many(books_list)
    
    print(f"  📊 Totale libri unici (ISBN): {len(books_list)}")
    
    # 3. Statistiche finali
    print("\n" + "=" * 70)
    print("📊 RIEPILOGO IMPORTAZIONE")
    print("=" * 70)
    
    # Stats per scuola
    print("\n📍 Adozioni per scuola:")
    for scuola in schools_to_insert:
        codice = scuola["codice_meccanografico"]
        count = await db.adozioni.count_documents({"codice_scuola": codice})
        status = "✅" if count > 0 else "⚠️ (nessun libro)"
        print(f"  {status} {scuola['nome']}: {count} adozioni")
    
    # Stats per tipo
    print("\n📍 Adozioni per grado:")
    count_mm = await db.adozioni.count_documents({"tipo_grado": "MM"})
    count_nt = await db.adozioni.count_documents({"tipo_grado": "NT"})
    print(f"  🎓 Scuole Medie (MM): {count_mm}")
    print(f"  🏛️ Scuole Superiori (NT): {count_nt}")
    
    print("\n" + "=" * 70)
    print("✅ IMPORTAZIONE COMPLETATA!")
    print("=" * 70)
    
    client.close()

if __name__ == "__main__":
    asyncio.run(import_data())
