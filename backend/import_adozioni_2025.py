#!/usr/bin/env python3
"""
Script per importare le adozioni 2025/2026 dal CSV del MIUR nel database MongoDB.
Filtra solo le scuole di Catanzaro (codici che iniziano con CZ).
"""

import csv
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from collections import defaultdict
import os
from dotenv import load_dotenv

load_dotenv()

# Configurazione
CSV_FILE = "/app/backend/adozioni_calabria_2025.csv"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = "scambialibri"
ANNO_SCOLASTICO = "2025-2026"

# Mappa tipo scuola
TIPO_SCUOLA_MAP = {
    "EE": "primaria",
    "MM": "primo_grado",  # Scuola media
    "NO": "secondo_grado",  # Superiore biennio
    "NT": "secondo_grado",  # Superiore triennio
}

async def import_adozioni():
    """Importa le adozioni dal CSV."""
    
    # Connessione MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Leggi il CSV e raggruppa per scuola/classe/sezione
    adozioni_grouped = defaultdict(lambda: {
        "libri": [],
        "tipo_scuola": None,
        "combinazione": None
    })
    
    scuole_catanzaro = set()
    
    print(f"Leggendo {CSV_FILE}...")
    
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            codice_scuola = row.get('CODICESCUOLA', '')
            
            # Filtra solo Catanzaro
            if not codice_scuola.startswith('CZ'):
                continue
            
            # Salta scuole primarie per ora
            tipo = row.get('TIPOGRADOSCUOLA', '')
            if tipo == 'EE':
                continue
            
            scuole_catanzaro.add(codice_scuola)
            
            classe = int(row.get('ANNOCORSO', 0))
            sezione = row.get('SEZIONEANNO', '')
            combinazione = row.get('COMBINAZIONE', '')
            
            key = (codice_scuola, classe, sezione)
            
            # Estrai dati libro
            prezzo_str = row.get('PREZZO', '0').replace(',', '.')
            try:
                prezzo = float(prezzo_str)
            except:
                prezzo = 0.0
            
            volume = row.get('VOLUME', '')
            is_volume_unico = volume.upper() == 'U'
            
            nuova_adoz = row.get('NUOVAADOZ', '').upper() == 'SI'
            da_acquist = row.get('DAACQUIST', '').upper() == 'SI'
            consigliato_raw = row.get('CONSIGLIATO', 'No').strip().upper()  # 'NO', 'SI', 'AP'
            
            libro = {
                "isbn": row.get('CODICEISBN', ''),
                "titolo": row.get('TITOLO', ''),
                "sottotitolo": row.get('SOTTOTITOLO', ''),
                "autori": row.get('AUTORI', ''),
                "editore": row.get('EDITORE', ''),
                "prezzo_copertina": prezzo,
                "disciplina": row.get('DISCIPLINA', ''),
                "volume": volume,
                "is_volume_unico": is_volume_unico,
                "nuova_adozione": nuova_adoz,
                "da_acquistare": da_acquist,
                "consigliato_raw": consigliato_raw,  # Valore originale: 'NO', 'SI', 'AP'
            }
            
            adozioni_grouped[key]["libri"].append(libro)
            adozioni_grouped[key]["tipo_scuola"] = TIPO_SCUOLA_MAP.get(tipo, tipo)
            adozioni_grouped[key]["combinazione"] = combinazione
    
    print(f"Trovate {len(scuole_catanzaro)} scuole di Catanzaro")
    print(f"Trovati {len(adozioni_grouped)} gruppi classe/sezione")
    
    # Crea collezione per dati 2025-2026
    collection_name = f"adozioni_{ANNO_SCOLASTICO.replace('-', '_')}"
    
    # Elimina dati esistenti per le scuole di Catanzaro
    await db[collection_name].delete_many({"codice_scuola": {"$regex": "^CZ"}})
    
    # Inserisci nuovi dati
    documents = []
    for (codice_scuola, classe, sezione), data in adozioni_grouped.items():
        doc = {
            "codice_scuola": codice_scuola,
            "classe": classe,
            "sezione": sezione,
            "tipo_scuola": data["tipo_scuola"],
            "combinazione": data["combinazione"],
            "anno_scolastico": ANNO_SCOLASTICO,
            "libri": data["libri"]
        }
        documents.append(doc)
    
    if documents:
        result = await db[collection_name].insert_many(documents)
        print(f"Inseriti {len(result.inserted_ids)} documenti nella collezione '{collection_name}'")
    
    # Aggiorna anche la collezione principale 'adozioni' per le scuole di Catanzaro
    # Sovrascrive i dati esistenti
    print("\nAggiornamento collezione 'adozioni' principale...")
    
    updated = 0
    inserted = 0
    
    for (codice_scuola, classe, sezione), data in adozioni_grouped.items():
        result = await db.adozioni.update_one(
            {
                "codice_scuola": codice_scuola,
                "classe": classe,
                "sezione": sezione
            },
            {
                "$set": {
                    "tipo_scuola": data["tipo_scuola"],
                    "combinazione": data["combinazione"],
                    "libri": data["libri"]
                }
            },
            upsert=True
        )
        
        if result.upserted_id:
            inserted += 1
        elif result.modified_count > 0:
            updated += 1
    
    print(f"Collezione 'adozioni': {updated} aggiornati, {inserted} inseriti")
    
    # Statistiche finali
    total_adozioni = await db.adozioni.count_documents({"codice_scuola": {"$regex": "^CZ"}})
    print(f"\nTotale adozioni Catanzaro nel DB: {total_adozioni}")
    
    client.close()
    print("\nImportazione completata!")

if __name__ == "__main__":
    asyncio.run(import_adozioni())
