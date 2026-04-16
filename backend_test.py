#!/usr/bin/env python3
"""
Backend Test for Book Classification Logic - Carmen (1st Year Middle School)
Testing endpoint: /api/profiles/{user_id}/children/{child_id}/compatibility

Expected Results for Carmen:
- LIBRI NUOVI (nuovi.libri): 6 books (ITALIANO, SCIENZE, SCIENZE MOTORIE, ARTE E IMMAGINE, MUSICA, RELIGIONE)
- LIBRI USATI (comprare.libri_usati): 6 books (LINGUA INGLESE, STORIA, GEOGRAFIA, MATEMATICA, TECNOLOGIA, SECONDA LINGUA COMUNITARIA - FRANCESE)
"""

import requests
import json
import sys
import os

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://language-check-10.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test data
USER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"
CHILD_ID = "66ff6294-5695-4a67-bf92-798643a50ef2"  # Carmen
SCHOOL_CODE = "CZMM86001P"  # I.C. Casalinuovo
CLASS = 1  # First year middle school

def test_book_classification():
    """Test the book classification logic for Carmen (1st year middle school)"""
    
    print("=" * 80)
    print("TESTING BOOK CLASSIFICATION LOGIC FOR CARMEN (1ST YEAR MIDDLE SCHOOL)")
    print("=" * 80)
    print(f"User ID: {USER_ID}")
    print(f"Child ID: {CHILD_ID}")
    print(f"School: {SCHOOL_CODE} (I.C. Casalinuovo)")
    print(f"Class: {CLASS} (first year middle school)")
    print()
    
    # Test the compatibility endpoint
    url = f"{API_BASE}/profiles/{USER_ID}/children/{CHILD_ID}/compatibility"
    print(f"Testing endpoint: {url}")
    
    try:
        response = requests.get(url, timeout=30)
        print(f"Response status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ ERROR: Expected status 200, got {response.status_code}")
            print(f"Response text: {response.text}")
            return False
        
        data = response.json()
        print("✅ API call successful")
        print()
        
        # Verify response structure
        required_keys = ['nuovi', 'comprare', 'child_name', 'child_classe']
        missing_keys = [key for key in required_keys if key not in data]
        if missing_keys:
            print(f"❌ ERROR: Missing required keys: {missing_keys}")
            return False
        
        print("✅ Response structure valid")
        print()
        
        # Extract key data
        nuovi = data.get('nuovi', {})
        comprare = data.get('comprare', {})
        child_name = data.get('child_name', '')
        child_classe = data.get('child_classe', 0)
        
        print(f"Child Name: {child_name}")
        print(f"Child Class: {child_classe}")
        print()
        
        # Test LIBRI NUOVI (should be 6 books)
        print("TESTING LIBRI NUOVI:")
        print("-" * 40)
        
        nuovi_libri = nuovi.get('libri', [])
        nuovi_totale = nuovi.get('totale', 0)
        nuovi_costo = nuovi.get('costo_totale', 0)
        
        print(f"Total new books: {nuovi_totale}")
        print(f"Expected: 6")
        print(f"Total cost: €{nuovi_costo}")
        print(f"Expected: around €172.60")
        print()
        
        if nuovi_totale != 6:
            print(f"❌ ERROR: Expected 6 new books, got {nuovi_totale}")
        else:
            print("✅ Correct number of new books")
        
        if abs(nuovi_costo - 172.60) > 20:  # Allow some tolerance
            print(f"⚠️  WARNING: Cost {nuovi_costo} differs significantly from expected 172.60")
        else:
            print("✅ Cost is within expected range")
        
        print()
        print("New books details:")
        expected_new_subjects = {
            'ITALIANO', 'SCIENZE', 'SCIENZE MOTORIE', 'ARTE E IMMAGINE', 'MUSICA', 'RELIGIONE'
        }
        found_subjects = set()
        
        for i, libro in enumerate(nuovi_libri, 1):
            disciplina = libro.get('disciplina', '').upper()
            titolo = libro.get('titolo', '')
            motivo = libro.get('motivo', '')
            prezzo = libro.get('prezzo', 0)
            
            print(f"  {i}. {disciplina}: {titolo[:50]} - €{prezzo}")
            if motivo:
                print(f"     Reason: {motivo}")
            
            found_subjects.add(disciplina)
        
        print()
        
        # Check if we have the expected subjects
        missing_subjects = expected_new_subjects - found_subjects
        extra_subjects = found_subjects - expected_new_subjects
        
        if missing_subjects:
            print(f"❌ ERROR: Missing expected subjects in new books: {missing_subjects}")
        if extra_subjects:
            print(f"⚠️  WARNING: Extra subjects in new books: {extra_subjects}")
        if not missing_subjects and not extra_subjects:
            print("✅ All expected subjects found in new books")
        
        print()
        
        # Test LIBRI USATI (should be 6 books)
        print("TESTING LIBRI USATI:")
        print("-" * 40)
        
        usati_libri = comprare.get('libri_usati', [])
        usati_totale = comprare.get('totale_usati', len(usati_libri))
        
        print(f"Total used books: {usati_totale}")
        print(f"Expected: 6")
        print()
        
        if usati_totale != 6:
            print(f"❌ ERROR: Expected 6 used books, got {usati_totale}")
        else:
            print("✅ Correct number of used books")
        
        print()
        print("Used books details:")
        expected_used_subjects = {
            'LINGUA INGLESE', 'STORIA', 'GEOGRAFIA', 'MATEMATICA', 'TECNOLOGIA', 
            'SECONDA LINGUA COMUNITARIA - FRANCESE', 'FRANCESE'  # Allow both forms
        }
        found_used_subjects = set()
        
        for i, libro in enumerate(usati_libri, 1):
            disciplina = libro.get('disciplina', '').upper()
            titolo = libro.get('titolo', '')
            status = libro.get('status', '')
            prezzo_nuovo = libro.get('prezzo_nuovo', 0)
            prezzo_usato = libro.get('prezzo_usato', 0)
            
            print(f"  {i}. {disciplina}: {titolo[:50]}")
            print(f"     Status: {status}, New: €{prezzo_nuovo}, Used: €{prezzo_usato}")
            
            found_used_subjects.add(disciplina)
        
        print()
        
        # Check if we have the expected subjects (with some flexibility for French)
        # Accept either "SECONDA LINGUA COMUNITARIA - FRANCESE" or "FRANCESE"
        if 'FRANCESE' in found_used_subjects or 'SECONDA LINGUA COMUNITARIA - FRANCESE' in found_used_subjects:
            expected_used_subjects.discard('SECONDA LINGUA COMUNITARIA - FRANCESE')
            expected_used_subjects.discard('FRANCESE')
            expected_used_subjects.add('FRANCESE')  # Normalize to FRANCESE
            found_used_subjects.discard('SECONDA LINGUA COMUNITARIA - FRANCESE')
            found_used_subjects.add('FRANCESE')
        
        missing_used_subjects = expected_used_subjects - found_used_subjects
        extra_used_subjects = found_used_subjects - expected_used_subjects
        
        if missing_used_subjects:
            print(f"❌ ERROR: Missing expected subjects in used books: {missing_used_subjects}")
        if extra_used_subjects:
            print(f"⚠️  WARNING: Extra subjects in used books: {extra_used_subjects}")
        if not missing_used_subjects and not extra_used_subjects:
            print("✅ All expected subjects found in used books")
        
        print()
        
        # Test specific criteria from the request
        print("TESTING SPECIFIC CRITERIA:")
        print("-" * 40)
        
        # Check for nuova_adozione books in new books
        nuova_adozione_count = 0
        for libro in nuovi_libri:
            if libro.get('is_nuova_adozione') or 'nuova adozione' in libro.get('motivo', '').lower():
                nuova_adozione_count += 1
        
        print(f"Books with 'nuova_adozione' in new books: {nuova_adozione_count}")
        
        # Check for volume unico books
        volume_unico_new = 0
        volume_unico_used = 0
        
        for libro in nuovi_libri:
            if libro.get('is_volume_unico') or 'volume unico' in libro.get('motivo', '').lower():
                volume_unico_new += 1
                disciplina = libro.get('disciplina', '').upper()
                print(f"  Volume unico in NEW: {disciplina}")
        
        for libro in usati_libri:
            if libro.get('is_volume_unico'):
                volume_unico_used += 1
                disciplina = libro.get('disciplina', '').upper()
                print(f"  Volume unico in USED: {disciplina}")
        
        print()
        
        # Summary
        print("SUMMARY:")
        print("-" * 40)
        total_errors = 0
        
        if nuovi_totale == 6:
            print("✅ Correct number of new books (6)")
        else:
            print(f"❌ Wrong number of new books: {nuovi_totale} (expected 6)")
            total_errors += 1
        
        if usati_totale == 6:
            print("✅ Correct number of used books (6)")
        else:
            print(f"❌ Wrong number of used books: {usati_totale} (expected 6)")
            total_errors += 1
        
        if not missing_subjects:
            print("✅ All expected subjects in new books")
        else:
            print(f"❌ Missing subjects in new books: {missing_subjects}")
            total_errors += 1
        
        if not missing_used_subjects:
            print("✅ All expected subjects in used books")
        else:
            print(f"❌ Missing subjects in used books: {missing_used_subjects}")
            total_errors += 1
        
        print()
        
        if total_errors == 0:
            print("🎉 ALL TESTS PASSED! Book classification logic is working correctly.")
            return True
        else:
            print(f"❌ {total_errors} test(s) failed. Book classification logic needs fixes.")
            return False
        
    except requests.exceptions.RequestException as e:
        print(f"❌ ERROR: Request failed: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ ERROR: Invalid JSON response: {e}")
        return False
    except Exception as e:
        print(f"❌ ERROR: Unexpected error: {e}")
        return False

def main():
    """Main test function"""
    print("Starting Book Classification Logic Test...")
    print(f"Backend URL: {BACKEND_URL}")
    print()
    
    success = test_book_classification()
    
    print()
    print("=" * 80)
    if success:
        print("✅ BOOK CLASSIFICATION TEST COMPLETED SUCCESSFULLY")
        sys.exit(0)
    else:
        print("❌ BOOK CLASSIFICATION TEST FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()