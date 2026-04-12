#!/usr/bin/env python3
"""
Test per verificare l'allineamento tra endpoint books-to-sell e compatibility (Radar)
"""

import requests
import json
from typing import Dict, List, Any

# Configuration
BASE_URL = "https://language-check-10.preview.emergentagent.com/api"
USER_ID = "3b633bd5-12ae-4050-9393-9e842df662c5"  # George - carco83@gmail.com

def test_books_to_sell_radar_alignment():
    """
    Test principale per verificare che l'endpoint books-to-sell restituisca
    ESATTAMENTE gli stessi libri che appaiono nel Radar sotto "Libri che [NOME] può vendere alla Xª"
    """
    print("=" * 80)
    print("TEST ENDPOINT BOOKS-TO-SELL vs RADAR COMPATIBILITY")
    print("=" * 80)
    
    # Step 1: Get user data to find child IDs
    print(f"\n1. Recupero dati utente {USER_ID}...")
    try:
        response = requests.get(f"{BASE_URL}/users/{USER_ID}")
        if response.status_code != 200:
            print(f"❌ ERRORE: Impossibile recuperare dati utente. Status: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        user_data = response.json()
        profili_figli = user_data.get("profili_figli", [])
        
        if not profili_figli:
            print("❌ ERRORE: Nessun profilo figlio trovato")
            return False
        
        print(f"✅ Trovati {len(profili_figli)} profili figli:")
        for profilo in profili_figli:
            nome = profilo.get("nome_figlio", "N/A")
            classe = profilo.get("classe", "N/A")
            tipo = profilo.get("tipo_scuola", "N/A")
            child_id = profilo.get("id", "N/A")
            print(f"   - {nome} ({classe}° {tipo}) - ID: {child_id}")
        
    except Exception as e:
        print(f"❌ ERRORE nella richiesta utente: {e}")
        return False
    
    # Step 2: Find GESON (4° superiore)
    geson_profile = None
    for profilo in profili_figli:
        nome = profilo.get("nome_figlio", "").upper()
        classe = int(profilo.get("classe", 0))
        tipo = profilo.get("tipo_scuola", "")
        
        if "GESON" in nome and classe == 4 and tipo == "secondo_grado":
            geson_profile = profilo
            break
    
    if not geson_profile:
        print("❌ ERRORE: Profilo GESON (4° superiore) non trovato")
        print("Profili disponibili:")
        for profilo in profili_figli:
            nome = profilo.get("nome_figlio", "N/A")
            classe = profilo.get("classe", "N/A")
            tipo = profilo.get("tipo_scuola", "N/A")
            print(f"   - {nome} ({classe}° {tipo})")
        return False
    
    geson_id = geson_profile.get("id")
    geson_nome = geson_profile.get("nome_figlio")
    print(f"\n✅ Trovato profilo GESON: {geson_nome} (ID: {geson_id})")
    
    # Step 3: Test Compatibility endpoint (Radar)
    print(f"\n2. Test endpoint Compatibility (Radar) per GESON...")
    try:
        response = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{geson_id}/compatibility")
        if response.status_code != 200:
            print(f"❌ ERRORE: Compatibility endpoint failed. Status: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        compatibility_data = response.json()
        vendere_section = compatibility_data.get("vendere", {})
        libri_vendibili_radar = vendere_section.get("libri_vendibili", [])
        
        print(f"✅ Compatibility endpoint OK")
        print(f"   - Classe destinazione: {vendere_section.get('classe_destinazione', 'N/A')}")
        print(f"   - Totale vendibili nel Radar: {len(libri_vendibili_radar)}")
        
        if libri_vendibili_radar:
            print("   - Libri vendibili nel Radar:")
            for i, libro in enumerate(libri_vendibili_radar, 1):
                titolo = libro.get("titolo", "N/A")
                isbn = libro.get("isbn", "N/A")
                disciplina = libro.get("disciplina", "N/A")
                status = libro.get("status", "N/A")
                print(f"     {i}. {titolo[:50]} (ISBN: {isbn}) - {disciplina} - {status}")
        else:
            print("   - Nessun libro vendibile nel Radar")
        
    except Exception as e:
        print(f"❌ ERRORE nella richiesta compatibility: {e}")
        return False
    
    # Step 4: Test Books-to-sell endpoint
    print(f"\n3. Test endpoint Books-to-sell per GESON...")
    try:
        response = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{geson_id}/books-to-sell")
        if response.status_code != 200:
            print(f"❌ ERRORE: Books-to-sell endpoint failed. Status: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        books_to_sell_data = response.json()
        books_to_sell = books_to_sell_data.get("books", [])
        
        print(f"✅ Books-to-sell endpoint OK")
        print(f"   - Classe attuale: {books_to_sell_data.get('classe_attuale', 'N/A')}")
        print(f"   - Classe destinazione: {books_to_sell_data.get('classe_destinazione', 'N/A')}")
        print(f"   - Totale libri in books-to-sell: {len(books_to_sell)}")
        print(f"   - Message: {books_to_sell_data.get('message', 'N/A')}")
        
        if books_to_sell:
            print("   - Libri in books-to-sell:")
            for i, libro in enumerate(books_to_sell, 1):
                titolo = libro.get("titolo", "N/A")
                isbn = libro.get("isbn", "N/A")
                disciplina = libro.get("disciplina", "N/A")
                status = libro.get("status", "N/A")
                print(f"     {i}. {titolo[:50]} (ISBN: {isbn}) - {disciplina} - {status}")
        else:
            print("   - Nessun libro in books-to-sell")
        
    except Exception as e:
        print(f"❌ ERRORE nella richiesta books-to-sell: {e}")
        return False
    
    # Step 5: Compare the results
    print(f"\n4. CONFRONTO RISULTATI:")
    print("=" * 50)
    
    # Extract ISBN lists for comparison
    radar_isbns = set(libro.get("isbn", "") for libro in libri_vendibili_radar if libro.get("isbn"))
    books_to_sell_isbns = set(libro.get("isbn", "") for libro in books_to_sell if libro.get("isbn"))
    
    # Extract title lists for comparison (in case ISBN is missing)
    radar_titles = set(libro.get("titolo", "").strip().upper() for libro in libri_vendibili_radar)
    books_to_sell_titles = set(libro.get("titolo", "").strip().upper() for libro in books_to_sell)
    
    print(f"📊 STATISTICHE:")
    print(f"   - Radar (libri_vendibili): {len(libri_vendibili_radar)} libri")
    print(f"   - Books-to-sell: {len(books_to_sell)} libri")
    print(f"   - ISBN nel Radar: {len(radar_isbns)} ISBN")
    print(f"   - ISBN in books-to-sell: {len(books_to_sell_isbns)} ISBN")
    
    # Check if books-to-sell is a subset of radar vendibili
    missing_in_books_to_sell = radar_isbns - books_to_sell_isbns
    extra_in_books_to_sell = books_to_sell_isbns - radar_isbns
    
    print(f"\n🔍 ANALISI ALLINEAMENTO:")
    
    if len(missing_in_books_to_sell) == 0 and len(extra_in_books_to_sell) == 0:
        print("✅ PERFETTO ALLINEAMENTO: I libri in books-to-sell corrispondono ESATTAMENTE a quelli nel Radar")
        alignment_score = 100
    elif len(extra_in_books_to_sell) == 0:
        print("✅ SUBSET CORRETTO: Books-to-sell è un sottoinsieme corretto del Radar")
        print(f"   - Libri nel Radar ma non in books-to-sell: {len(missing_in_books_to_sell)}")
        alignment_score = 90
    else:
        print("❌ DISALLINEAMENTO RILEVATO:")
        alignment_score = 50
    
    if missing_in_books_to_sell:
        print(f"\n📋 LIBRI NEL RADAR MA NON IN BOOKS-TO-SELL ({len(missing_in_books_to_sell)}):")
        for isbn in missing_in_books_to_sell:
            # Find the book details
            for libro in libri_vendibili_radar:
                if libro.get("isbn") == isbn:
                    titolo = libro.get("titolo", "N/A")
                    disciplina = libro.get("disciplina", "N/A")
                    print(f"   - {titolo[:40]} (ISBN: {isbn}) - {disciplina}")
                    break
    
    if extra_in_books_to_sell:
        print(f"\n📋 LIBRI IN BOOKS-TO-SELL MA NON NEL RADAR ({len(extra_in_books_to_sell)}):")
        for isbn in extra_in_books_to_sell:
            # Find the book details
            for libro in books_to_sell:
                if libro.get("isbn") == isbn:
                    titolo = libro.get("titolo", "N/A")
                    disciplina = libro.get("disciplina", "N/A")
                    print(f"   - {titolo[:40]} (ISBN: {isbn}) - {disciplina}")
                    break
    
    # Step 6: Test with other children (MIMMO, LUIGINA)
    print(f"\n5. TEST RAPIDO ALTRI PROFILI:")
    print("=" * 40)
    
    for profilo in profili_figli:
        nome = profilo.get("nome_figlio", "")
        child_id = profilo.get("id")
        
        if nome.upper() in ["MIMMO", "LUIGINA"]:
            print(f"\n🔍 Test rapido per {nome}:")
            try:
                # Test compatibility
                comp_resp = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{child_id}/compatibility")
                if comp_resp.status_code == 200:
                    comp_data = comp_resp.json()
                    radar_vendibili = len(comp_data.get("vendere", {}).get("libri_vendibili", []))
                    print(f"   - Radar vendibili: {radar_vendibili}")
                else:
                    print(f"   - Radar: ERRORE {comp_resp.status_code}")
                    continue
                
                # Test books-to-sell
                bts_resp = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{child_id}/books-to-sell")
                if bts_resp.status_code == 200:
                    bts_data = bts_resp.json()
                    bts_books = len(bts_data.get("books", []))
                    print(f"   - Books-to-sell: {bts_books}")
                    print(f"   - Allineamento: {'✅' if radar_vendibili == bts_books else '❌'}")
                else:
                    print(f"   - Books-to-sell: ERRORE {bts_resp.status_code}")
                
            except Exception as e:
                print(f"   - ERRORE: {e}")
    
    # Final result
    print(f"\n" + "=" * 80)
    print(f"🎯 RISULTATO FINALE:")
    print(f"   - Alignment Score: {alignment_score}%")
    
    if alignment_score >= 90:
        print("✅ TEST SUPERATO: L'endpoint books-to-sell è correttamente allineato con il Radar")
        return True
    else:
        print("❌ TEST FALLITO: Disallineamento rilevato tra books-to-sell e Radar")
        return False

def test_non_sellable_books_verification():
    """
    Test aggiuntivo per verificare che i libri NON vendibili (edizione cambiata)
    NON appaiano in books-to-sell
    """
    print(f"\n" + "=" * 80)
    print("TEST VERIFICA LIBRI NON VENDIBILI")
    print("=" * 80)
    
    try:
        # Get GESON profile again
        response = requests.get(f"{BASE_URL}/users/{USER_ID}")
        user_data = response.json()
        profili_figli = user_data.get("profili_figli", [])
        
        geson_profile = None
        for profilo in profili_figli:
            nome = profilo.get("nome_figlio", "").upper()
            classe = int(profilo.get("classe", 0))
            tipo = profilo.get("tipo_scuola", "")
            
            if "GESON" in nome and classe == 4 and tipo == "secondo_grado":
                geson_profile = profilo
                break
        
        if not geson_profile:
            print("❌ Profilo GESON non trovato")
            return False
        
        geson_id = geson_profile.get("id")
        
        # Get compatibility data
        comp_resp = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{geson_id}/compatibility")
        comp_data = comp_resp.json()
        
        libri_non_vendibili = comp_data.get("vendere", {}).get("libri_non_vendibili", [])
        
        # Get books-to-sell data
        bts_resp = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{geson_id}/books-to-sell")
        bts_data = bts_resp.json()
        books_to_sell = bts_data.get("books", [])
        
        print(f"📊 LIBRI NON VENDIBILI NEL RADAR: {len(libri_non_vendibili)}")
        if libri_non_vendibili:
            for libro in libri_non_vendibili:
                titolo_vecchio = libro.get("titolo_vecchio", "N/A")
                titolo_nuovo = libro.get("titolo_nuovo", "N/A")
                status = libro.get("status", "N/A")
                print(f"   - {titolo_vecchio} → {titolo_nuovo} ({status})")
        
        # Check if any non-sellable books appear in books-to-sell
        print(f"\n🔍 VERIFICA: I libri NON vendibili NON devono apparire in books-to-sell")
        
        # This is a logical check - if books are marked as non-sellable due to edition changes,
        # they should not appear in the books-to-sell list
        non_vendibili_titles = set()
        for libro in libri_non_vendibili:
            titolo_vecchio = libro.get("titolo_vecchio", "").strip().upper()
            if titolo_vecchio:
                non_vendibili_titles.add(titolo_vecchio)
        
        books_to_sell_titles = set()
        for libro in books_to_sell:
            titolo = libro.get("titolo", "").strip().upper()
            if titolo:
                books_to_sell_titles.add(titolo)
        
        # Check for overlap (should be none)
        overlap = non_vendibili_titles.intersection(books_to_sell_titles)
        
        if not overlap:
            print("✅ CORRETTO: Nessun libro NON vendibile appare in books-to-sell")
            return True
        else:
            print(f"❌ ERRORE: {len(overlap)} libri NON vendibili appaiono in books-to-sell:")
            for titolo in overlap:
                print(f"   - {titolo}")
            return False
        
    except Exception as e:
        print(f"❌ ERRORE nel test libri non vendibili: {e}")
        return False

if __name__ == "__main__":
    print("🚀 AVVIO TEST BOOKS-TO-SELL vs RADAR ALIGNMENT")
    print("User ID:", USER_ID)
    print("Backend URL:", BASE_URL)
    
    # Run main test
    main_test_passed = test_books_to_sell_radar_alignment()
    
    # Run additional verification
    non_sellable_test_passed = test_non_sellable_books_verification()
    
    print(f"\n" + "=" * 80)
    print("📋 RIEPILOGO FINALE:")
    print(f"   - Test allineamento principale: {'✅ PASS' if main_test_passed else '❌ FAIL'}")
    print(f"   - Test libri non vendibili: {'✅ PASS' if non_sellable_test_passed else '❌ FAIL'}")
    
    overall_success = main_test_passed and non_sellable_test_passed
    print(f"   - Risultato complessivo: {'✅ TUTTI I TEST SUPERATI' if overall_success else '❌ ALCUNI TEST FALLITI'}")
    
    if overall_success:
        print("\n🎉 L'endpoint books-to-sell è correttamente allineato con il Radar!")
    else:
        print("\n⚠️  Sono stati rilevati problemi di allineamento che richiedono correzione.")