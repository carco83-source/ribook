#!/usr/bin/env python3
"""
Script per importare i libri di testo con supporto SEZIONI
Ogni combinazione scuola-classe-sezione ha la sua lista di libri
"""

import csv
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")

async def import_books():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.scambialibri
    
    csv_path = "/app/backend/calabria_libri.csv"
    
    # Dizionario per salvare libri per combinazione scuola-classe-sezione
    # Key: scuola_classe_sezione
    # Value: list of books
    libri_per_sezione = {}
    
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
            sezione = row['SEZIONEANNO'].strip().upper()
            combinazione = row['COMBINAZIONE'].strip()
            volume = row['VOLUME'].strip()
            
            is_volume_unico = volume.upper() == 'U'
            
            # Prezzo
            prezzo_str = row['PREZZO'].replace(',', '.').strip()
            try:
                prezzo = float(prezzo_str)
            except:
                prezzo = 0.0
            
            # Key univoca per scuola-classe-sezione
            key = f"{codice_scuola}_{anno_corso}_{sezione}"
            
            if key not in libri_per_sezione:
                libri_per_sezione[key] = {
                    'codice_scuola': codice_scuola,
                    'classe': anno_corso,
                    'sezione': sezione,
                    'tipo_scuola': tipo_scuola,
                    'combinazione': combinazione,
                    'libri': []
                }
            
            # Aggiungi libro alla lista
            libro = {
                'isbn': isbn,
                'titolo': row['TITOLO'].strip(),
                'sottotitolo': row['SOTTOTITOLO'].strip() if row['SOTTOTITOLO'] != 'ND' else '',
                'autori': row['AUTORI'].strip(),
                'editore': row['EDITORE'].strip(),
                'prezzo_copertina': prezzo,
                'disciplina': row['DISCIPLINA'].strip(),
                'volume': volume,
                'is_volume_unico': is_volume_unico,
                'nuova_adozione': row['NUOVAADOZ'].upper() == 'SI',
                'da_acquistare': row['DAACQUIST'].upper() == 'SI',
                'consigliato': row['CONSIGLIATO'].upper() == 'SI' if 'CONSIGLIATO' in row else False,
            }
            
            # Evita duplicati ISBN nella stessa sezione
            existing_isbns = [l['isbn'] for l in libri_per_sezione[key]['libri']]
            if isbn not in existing_isbns:
                libri_per_sezione[key]['libri'].append(libro)
    
    print(f"📚 Trovate {len(libri_per_sezione)} combinazioni scuola-classe-sezione")
    
    # Conta libri totali
    total_books = sum(len(v['libri']) for v in libri_per_sezione.values())
    print(f"📖 Totale libri: {total_books}")
    
    # Salva in una nuova collection "adozioni"
    print("💾 Salvataggio in MongoDB (collection 'adozioni')...")
    
    await db.adozioni.drop()
    
    docs = []
    for key, data in libri_per_sezione.items():
        doc = {
            'codice_scuola': data['codice_scuola'],
            'classe': data['classe'],
            'sezione': data['sezione'],
            'tipo_scuola': data['tipo_scuola'],
            'combinazione': data['combinazione'],
            'libri': data['libri'],
            'num_libri': len(data['libri']),
            'created_at': datetime.now()
        }
        docs.append(doc)
    
    if docs:
        await db.adozioni.insert_many(docs)
        
        # Crea indici
        await db.adozioni.create_index([
            ("codice_scuola", 1),
            ("classe", 1),
            ("sezione", 1)
        ])
    
    print(f"✅ Importate {len(docs)} adozioni")
    
    # Statistiche per Catanzaro
    stats = {}
    for data in libri_per_sezione.values():
        scuola = data['codice_scuola']
        if scuola not in stats:
            stats[scuola] = {'sezioni': set(), 'libri': 0}
        stats[scuola]['sezioni'].add(f"{data['classe']}{data['sezione']}")
        stats[scuola]['libri'] += len(data['libri'])
    
    print("\n📊 Statistiche per scuola:")
    for scuola, s in sorted(stats.items())[:10]:
        print(f"  {scuola}: {len(s['sezioni'])} sezioni, {s['libri']} libri")
    
    await client.close()

if __name__ == "__main__":
    asyncio.run(import_books())
