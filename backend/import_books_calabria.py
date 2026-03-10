#!/usr/bin/env python3
"""
Script per importare i libri di testo della Calabria (solo Catanzaro, medie e superiori)
e calcolare la percentuale di libri usati acquistabili secondo il D.P.R. 157/1989
(adozioni triennali)
"""

import csv
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")

# Configurazione cicli scolastici secondo D.P.R. 157/1989
CICLI_SCOLASTICI = {
    "MM": {  # Scuola Media (secondaria I grado)
        "durata_ciclo": 3,
        "anni": [1, 2, 3],
        "descrizione": "Scuola Media"
    },
    "NO": {  # Superiori Biennio
        "durata_ciclo": 2,
        "anni": [1, 2],
        "descrizione": "Superiori Biennio"
    },
    "NT": {  # Superiori Triennio
        "durata_ciclo": 3,
        "anni": [3, 4, 5],
        "descrizione": "Superiori Triennio"
    }
}

async def import_books():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.scambialibri
    
    csv_path = "/app/backend/calabria_libri.csv"
    
    # Dizionario per deduplicare per ISBN e raccogliere info
    books_by_isbn = {}
    # Traccia le adozioni per scuola/anno (per calcolo usato)
    adozioni_per_scuola = {}
    
    print("📖 Lettura CSV...")
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            codice_scuola = row['CODICESCUOLA']
            tipo_scuola = row['TIPOGRADOSCUOLA']
            
            # Filtra: solo Catanzaro (CZ) e solo Medie/Superiori
            if not codice_scuola.startswith('CZ'):
                continue
            if tipo_scuola not in ['MM', 'NO', 'NT']:
                continue
            
            isbn = row['CODICEISBN'].strip()
            if not isbn or len(isbn) < 10:
                continue
            
            anno_corso = int(row['ANNOCORSO']) if row['ANNOCORSO'].isdigit() else 1
            volume = row['VOLUME'].strip()
            
            # Calcola se il libro può essere venduto usato
            # Volume "U" = volume unico (vale per tutto il ciclo, NON vendibile fino a fine ciclo)
            # Altri volumi = specifici per anno
            is_volume_unico = volume.upper() == 'U'
            
            # Prezzo: converti da formato italiano (virgola) a float
            prezzo_str = row['PREZZO'].replace(',', '.').strip()
            try:
                prezzo = float(prezzo_str)
            except:
                prezzo = 0.0
            
            if isbn not in books_by_isbn:
                books_by_isbn[isbn] = {
                    'isbn': isbn,
                    'titolo': row['TITOLO'].strip(),
                    'sottotitolo': row['SOTTOTITOLO'].strip() if row['SOTTOTITOLO'] != 'ND' else '',
                    'autori': row['AUTORI'].strip(),
                    'editore': row['EDITORE'].strip(),
                    'prezzo_copertina': prezzo,
                    'disciplina': row['DISCIPLINA'].strip(),
                    'volume': volume,
                    'is_volume_unico': is_volume_unico,
                    'tipi_scuola': set(),
                    'anni_corso': set(),
                    'scuole_adottanti': set(),
                    'nuova_adozione': row['NUOVAADOZ'].upper() == 'SI',
                    'da_acquistare': row['DAACQUIST'].upper() == 'SI',
                    # Percentuale usato calcolata dopo
                    'perc_usato_disponibile': 0,
                }
            
            book = books_by_isbn[isbn]
            book['tipi_scuola'].add(tipo_scuola)
            book['anni_corso'].add(anno_corso)
            book['scuole_adottanti'].add(codice_scuola)
            
            # Se anche una sola scuola lo indica come nuova adozione, segna
            if row['NUOVAADOZ'].upper() == 'SI':
                book['nuova_adozione'] = True
            
            # Traccia adozioni per calcolo percentuale
            key = f"{codice_scuola}_{tipo_scuola}_{anno_corso}"
            if key not in adozioni_per_scuola:
                adozioni_per_scuola[key] = []
            adozioni_per_scuola[key].append({
                'isbn': isbn,
                'is_volume_unico': is_volume_unico,
                'nuova_adozione': row['NUOVAADOZ'].upper() == 'SI'
            })
    
    print(f"📚 Trovati {len(books_by_isbn)} libri unici")
    
    # Calcola percentuale usato secondo D.P.R. 157/1989
    print("🧮 Calcolo percentuali usato secondo normativa...")
    
    for isbn, book in books_by_isbn.items():
        """
        Logica D.P.R. 157/1989:
        - I libri sono adottati per cicli di 3 anni
        - Un libro NON può essere venduto usato se:
          1. È una NUOVA adozione (primo anno del ciclo)
          2. È un volume UNICO che copre tutto il ciclo
        - Un libro PUÒ essere venduto usato se:
          1. È al 2° o 3° anno di adozione
          2. È un volume specifico per anno (non unico)
        
        Stima percentuale usato disponibile:
        - Nuova adozione + Volume unico = 0% usato (tutti devono comprare nuovo)
        - Nuova adozione + Volume specifico = 0% usato primo anno
        - NON nuova adozione + Volume unico = 33% usato (1 anno su 3 vende)
        - NON nuova adozione + Volume specifico = 66% usato (2 anni su 3 vendono)
        """
        
        is_nuova = book['nuova_adozione']
        is_unico = book['is_volume_unico']
        
        if is_nuova:
            # Primo anno di adozione - nessun usato disponibile
            book['perc_usato_disponibile'] = 0
            book['motivo_usato'] = "Nuova adozione - nessun usato sul mercato"
        elif is_unico:
            # Volume unico ma non nuova adozione
            # Solo chi ha finito il ciclo può vendere (~33%)
            book['perc_usato_disponibile'] = 33
            book['motivo_usato'] = "Volume unico - disponibile da chi ha finito il ciclo"
        else:
            # Volume specifico per anno, non nuova adozione
            # Gli studenti dell'anno precedente possono vendere (~66%)
            book['perc_usato_disponibile'] = 66
            book['motivo_usato'] = "Volume annuale - buona disponibilità usato"
        
        # Converti set in liste per MongoDB
        book['tipi_scuola'] = list(book['tipi_scuola'])
        book['anni_corso'] = list(book['anni_corso'])
        book['scuole_adottanti'] = list(book['scuole_adottanti'])
        book['num_scuole_adottanti'] = len(book['scuole_adottanti'])
        book['created_at'] = datetime.utcnow()
        book['regione'] = 'Calabria'
        book['provincia'] = 'Catanzaro'
    
    # Inserisci nel database
    print("💾 Inserimento nel database...")
    
    # Prima elimina i vecchi libri della Calabria
    result = await db.books.delete_many({'regione': 'Calabria'})
    print(f"   Rimossi {result.deleted_count} libri precedenti")
    
    # Inserisci i nuovi
    books_list = list(books_by_isbn.values())
    if books_list:
        result = await db.books.insert_many(books_list)
        print(f"   Inseriti {len(result.inserted_ids)} libri")
    
    # Statistiche finali
    print("\n📊 STATISTICHE IMPORT:")
    print(f"   Totale libri: {len(books_list)}")
    
    # Conta per tipo scuola
    medie = sum(1 for b in books_list if 'MM' in b['tipi_scuola'])
    superiori = sum(1 for b in books_list if 'NO' in b['tipi_scuola'] or 'NT' in b['tipi_scuola'])
    print(f"   Libri scuola media: {medie}")
    print(f"   Libri scuola superiore: {superiori}")
    
    # Conta per disponibilità usato
    usato_0 = sum(1 for b in books_list if b['perc_usato_disponibile'] == 0)
    usato_33 = sum(1 for b in books_list if b['perc_usato_disponibile'] == 33)
    usato_66 = sum(1 for b in books_list if b['perc_usato_disponibile'] == 66)
    
    print(f"\n📈 DISPONIBILITÀ USATO (D.P.R. 157/1989):")
    print(f"   0% usato (nuove adozioni): {usato_0} libri ({usato_0*100//len(books_list)}%)")
    print(f"   33% usato (volumi unici): {usato_33} libri ({usato_33*100//len(books_list)}%)")
    print(f"   66% usato (volumi annuali): {usato_66} libri ({usato_66*100//len(books_list)}%)")
    
    # Calcola percentuale media complessiva
    if books_list:
        avg_usato = sum(b['perc_usato_disponibile'] for b in books_list) / len(books_list)
        print(f"\n   📌 MEDIA DISPONIBILITÀ USATO: {avg_usato:.1f}%")
        print(f"   📌 Quindi circa {100-avg_usato:.1f}% dovrà comprare nuovo")
    
    client.close()
    print("\n✅ Import completato!")

if __name__ == "__main__":
    asyncio.run(import_books())
