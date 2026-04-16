#!/usr/bin/env python3
"""
Script per cercare l'anno di pubblicazione di tutti i volumi unici
usando siti italiani di libri scolastici.
"""

import asyncio
import os
import re
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from datetime import datetime
from bs4 import BeautifulSoup

load_dotenv()

results = {}
errors = []

async def search_publication_year_italian(isbn: str, client: httpx.AsyncClient) -> int | None:
    """Cerca l'anno di pubblicazione su siti italiani"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    try:
        # 1. Prova IBS.it
        url = f"https://www.ibs.it/search/?ts=as&query={isbn}"
        response = await client.get(url, headers=headers, timeout=15, follow_redirects=True)
        if response.status_code == 200:
            text = response.text
            # Cerca pattern tipo "Data di Pubblicazione: 2023" o "Pubblicazione: 2023"
            year_match = re.search(r'(?:Pubblicazione|Data)[:\s]*(\d{4})', text, re.IGNORECASE)
            if year_match:
                return int(year_match.group(1))
            # Cerca anche nel formato "Anno: 2023"
            year_match = re.search(r'Anno[:\s]*(\d{4})', text, re.IGNORECASE)
            if year_match:
                return int(year_match.group(1))
        
        # 2. Prova Mondadori Store
        url = f"https://www.mondadoristore.it/search/?q={isbn}"
        response = await client.get(url, headers=headers, timeout=15, follow_redirects=True)
        if response.status_code == 200:
            text = response.text
            year_match = re.search(r'(?:Pubblicazione|Anno)[:\s]*(\d{4})', text, re.IGNORECASE)
            if year_match:
                return int(year_match.group(1))
        
        # 3. Prova Libraccio
        url = f"https://www.libraccio.it/src/?FT={isbn}"
        response = await client.get(url, headers=headers, timeout=15, follow_redirects=True)
        if response.status_code == 200:
            text = response.text
            year_match = re.search(r'(\d{4})', text)
            if year_match:
                year = int(year_match.group(1))
                if 2015 <= year <= 2026:
                    return year
        
        # 4. Prova Feltrinelli
        url = f"https://www.lafeltrinelli.it/search?q={isbn}"
        response = await client.get(url, headers=headers, timeout=15, follow_redirects=True)
        if response.status_code == 200:
            text = response.text
            year_match = re.search(r'(?:Pubblicazione|Anno)[:\s]*(\d{4})', text, re.IGNORECASE)
            if year_match:
                return int(year_match.group(1))
        
        return None
    except Exception as e:
        return None


async def search_with_websearch(isbn: str, titolo: str) -> int | None:
    """Fallback: cerca su internet il libro"""
    # Questo è un placeholder - in produzione useresti un'API di ricerca
    return None


async def main():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Avvio ricerca anni di pubblicazione (siti italiani)...")
    
    mongo_client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = mongo_client[os.environ['DB_NAME']]
    
    # Raccogli tutti gli ISBN dei volumi unici
    all_isbns = set()
    isbn_info = {}
    
    codici = await db.adozioni.distinct('codice_scuola')
    
    for codice in codici:
        adoz = await db.adozioni.find_one({'codice_scuola': codice, 'classe': 1})
        if adoz:
            for libro in adoz.get('libri', []):
                isbn = libro.get('isbn', '')
                if isbn and libro.get('is_volume_unico') and not libro.get('nuova_adozione'):
                    all_isbns.add(isbn)
                    if isbn not in isbn_info:
                        isbn_info[isbn] = {
                            'titolo': libro.get('titolo', '')[:50],
                            'editore': libro.get('editore', ''),
                            'disciplina': libro.get('disciplina', '')
                        }
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Trovati {len(all_isbns)} ISBN unici da verificare")
    
    found = 0
    not_found = 0
    
    async with httpx.AsyncClient() as client:
        isbn_list = list(all_isbns)
        
        for i, isbn in enumerate(isbn_list):
            year = await search_publication_year_italian(isbn, client)
            
            if year:
                results[isbn] = year
                found += 1
                print(f"  ✓ {isbn}: {year} - {isbn_info[isbn]['titolo'][:30]}")
            else:
                results[isbn] = None
                not_found += 1
                errors.append(isbn)
            
            if (i + 1) % 20 == 0:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Processati {i+1}/{len(isbn_list)} - Trovati: {found}, Non trovati: {not_found}")
            
            await asyncio.sleep(0.5)  # Rate limiting
    
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Ricerca completata!")
    print(f"  - Trovati: {found}")
    print(f"  - Non trovati: {not_found}")
    
    # Aggiorna database
    if found > 0:
        print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Aggiornamento database...")
        updated_count = 0
        
        cursor = db.adozioni.find({})
        async for adoz in cursor:
            libri = adoz.get('libri', [])
            modified = False
            
            for libro in libri:
                isbn = libro.get('isbn', '')
                if isbn in results and results[isbn]:
                    libro['anno_pubblicazione'] = results[isbn]
                    modified = True
            
            if modified:
                await db.adozioni.update_one(
                    {'_id': adoz['_id']},
                    {'$set': {'libri': libri}}
                )
                updated_count += 1
        
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Aggiornati {updated_count} documenti")
    
    # Salva report
    with open('/app/backend/publication_years_report.txt', 'w') as f:
        f.write(f"Report - {datetime.now()}\n{'='*60}\n\n")
        f.write(f"Trovati: {found}, Non trovati: {not_found}\n\n")
        
        f.write("TROVATI:\n")
        for isbn, year in sorted(results.items(), key=lambda x: x[1] or 9999):
            if year:
                f.write(f"{isbn} | {year} | {isbn_info.get(isbn, {}).get('titolo', 'N/A')}\n")
        
        f.write("\n\nNON TROVATI:\n")
        for isbn in errors:
            f.write(f"{isbn} | {isbn_info.get(isbn, {}).get('titolo', 'N/A')}\n")
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] COMPLETATO!")


if __name__ == "__main__":
    asyncio.run(main())
