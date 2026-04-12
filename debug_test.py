#!/usr/bin/env python3
"""
Debug test to understand the data structure differences between compatibility and books-to-sell
"""

import requests
import json

BASE_URL = "https://language-check-10.preview.emergentagent.com/api"
USER_ID = "3b633bd5-12ae-4050-9393-9e842df662c5"
GESON_ID = "6d2044e5-4764-4585-9563-19d1860bac4f"

def debug_data_comparison():
    print("=" * 80)
    print("DEBUG: COMPARISON OF DATA STRUCTURES")
    print("=" * 80)
    
    # Get compatibility data
    print("\n1. COMPATIBILITY ENDPOINT DATA:")
    comp_resp = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{GESON_ID}/compatibility")
    comp_data = comp_resp.json()
    
    vendere_section = comp_data.get("vendere", {})
    libri_vendibili = vendere_section.get("libri_vendibili", [])
    libri_non_vendibili = vendere_section.get("libri_non_vendibili", [])
    
    print(f"   - Classe destinazione: {vendere_section.get('classe_destinazione')}")
    print(f"   - Vendibili: {len(libri_vendibili)}")
    print(f"   - Non vendibili: {len(libri_non_vendibili)}")
    
    print("\n   VENDIBILI nel Radar:")
    for i, libro in enumerate(libri_vendibili, 1):
        print(f"     {i}. {libro.get('titolo', 'N/A')[:40]} (ISBN: {libro.get('isbn', 'N/A')}) - {libro.get('disciplina', 'N/A')}")
    
    print("\n   NON VENDIBILI nel Radar:")
    for i, libro in enumerate(libri_non_vendibili, 1):
        titolo_vecchio = libro.get('titolo_vecchio', 'N/A')
        titolo_nuovo = libro.get('titolo_nuovo', 'N/A')
        print(f"     {i}. {titolo_vecchio[:30]} → {titolo_nuovo[:30]} ({libro.get('status', 'N/A')})")
    
    # Get books-to-sell data
    print("\n2. BOOKS-TO-SELL ENDPOINT DATA:")
    bts_resp = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{GESON_ID}/books-to-sell")
    bts_data = bts_resp.json()
    
    books_to_sell = bts_data.get("books", [])
    print(f"   - Classe attuale: {bts_data.get('classe_attuale')}")
    print(f"   - Classe destinazione: {bts_data.get('classe_destinazione')}")
    print(f"   - Totale: {len(books_to_sell)}")
    print(f"   - Message: {bts_data.get('message')}")
    
    print("\n   BOOKS-TO-SELL:")
    for i, libro in enumerate(books_to_sell, 1):
        print(f"     {i}. {libro.get('titolo', 'N/A')[:40]} (ISBN: {libro.get('isbn', 'N/A')}) - {libro.get('disciplina', 'N/A')}")
    
    # Analysis
    print("\n3. DETAILED ANALYSIS:")
    print("=" * 50)
    
    # Create sets for comparison
    radar_isbns = {libro.get('isbn') for libro in libri_vendibili if libro.get('isbn')}
    bts_isbns = {libro.get('isbn') for libro in books_to_sell if libro.get('isbn')}
    
    # Books in both
    common_isbns = radar_isbns.intersection(bts_isbns)
    print(f"\n✅ BOOKS IN BOTH ({len(common_isbns)}):")
    for isbn in common_isbns:
        # Find book details
        for libro in libri_vendibili:
            if libro.get('isbn') == isbn:
                print(f"   - {libro.get('titolo', 'N/A')[:40]} (ISBN: {isbn})")
                break
    
    # Books only in radar
    only_radar = radar_isbns - bts_isbns
    print(f"\n📋 ONLY IN RADAR ({len(only_radar)}):")
    for isbn in only_radar:
        for libro in libri_vendibili:
            if libro.get('isbn') == isbn:
                print(f"   - {libro.get('titolo', 'N/A')[:40]} (ISBN: {isbn})")
                break
    
    # Books only in books-to-sell
    only_bts = bts_isbns - radar_isbns
    print(f"\n📋 ONLY IN BOOKS-TO-SELL ({len(only_bts)}):")
    for isbn in only_bts:
        for libro in books_to_sell:
            if libro.get('isbn') == isbn:
                print(f"   - {libro.get('titolo', 'N/A')[:40]} (ISBN: {isbn}) - {libro.get('disciplina', 'N/A')}")
                break
    
    # Check if any books-to-sell books match non-vendibili
    non_vendibili_titles = {libro.get('titolo_vecchio', '').strip().upper() for libro in libri_non_vendibili}
    bts_titles = {libro.get('titolo', '').strip().upper() for libro in books_to_sell}
    
    problematic_books = non_vendibili_titles.intersection(bts_titles)
    print(f"\n❌ BOOKS THAT SHOULD NOT BE SELLABLE ({len(problematic_books)}):")
    for title in problematic_books:
        print(f"   - {title[:50]}")
    
    return {
        'radar_vendibili': len(libri_vendibili),
        'bts_books': len(books_to_sell),
        'common': len(common_isbns),
        'only_radar': len(only_radar),
        'only_bts': len(only_bts),
        'problematic': len(problematic_books)
    }

if __name__ == "__main__":
    results = debug_data_comparison()
    
    print(f"\n" + "=" * 80)
    print("SUMMARY:")
    print(f"   - Radar vendibili: {results['radar_vendibili']}")
    print(f"   - Books-to-sell: {results['bts_books']}")
    print(f"   - Common books: {results['common']}")
    print(f"   - Only in radar: {results['only_radar']}")
    print(f"   - Only in books-to-sell: {results['only_bts']}")
    print(f"   - Problematic (should not be sellable): {results['problematic']}")
    
    if results['radar_vendibili'] == results['bts_books'] and results['only_radar'] == 0 and results['only_bts'] == 0:
        print("\n✅ PERFECT ALIGNMENT!")
    else:
        print("\n❌ MISALIGNMENT DETECTED!")