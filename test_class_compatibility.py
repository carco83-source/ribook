#!/usr/bin/env python3
"""
ScambiaLibri Class Compatibility API Test
Tests the specific book compatibility endpoint as requested
"""

import requests
import json
import sys

# Test Configuration
BASE_URL = "https://language-check-10.preview.emergentagent.com/api"
TEST_USER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"

def test_class_compatibility():
    """Test the class compatibility API endpoint"""
    print("🎯 Testing Class Compatibility API...")
    print(f"Testing user ID: {TEST_USER_ID}")
    print(f"API endpoint: {BASE_URL}/radar/{TEST_USER_ID}/class-compatibility")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/radar/{TEST_USER_ID}/class-compatibility", timeout=10)
        
        if response.status_code != 200:
            print(f"❌ API Request Failed - Status: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print("✅ API Request Successful")
        
        # Test Results Tracking
        tests_passed = 0
        tests_total = 0
        
        def check_test(test_name, condition, expected_value=None, actual_value=None):
            nonlocal tests_passed, tests_total
            tests_total += 1
            if condition:
                print(f"✅ {test_name}")
                tests_passed += 1
            else:
                if expected_value is not None and actual_value is not None:
                    print(f"❌ {test_name} - Expected: {expected_value}, Actual: {actual_value}")
                else:
                    print(f"❌ {test_name}")
        
        # Test 1: Basic Response Structure
        required_sections = ["vendere", "comprare", "nuovi", "summary"]
        missing_sections = [section for section in required_sections if section not in data]
        check_test("Basic Response Structure", len(missing_sections) == 0, "All sections present", f"Missing: {missing_sections}" if missing_sections else "All present")
        
        if missing_sections:
            return False
        
        # Test 2: User Info
        check_test("User Class", data.get("user_classe") == 2, 2, data.get("user_classe"))
        check_test("School Code", data.get("codice_scuola") == "CZMM86001P", "CZMM86001P", data.get("codice_scuola"))
        
        # Test 3: VENDERE section (to 1st grade)
        vendere = data["vendere"]
        totale_vendibili = vendere.get("totale_vendibili", 0)
        totale_non_vendibili = vendere.get("totale_non_vendibili", 0)
        
        check_test("Vendibili Count (~5)", 4 <= totale_vendibili <= 6, "4-6", totale_vendibili)
        check_test("Non Vendibili Count (2)", totale_non_vendibili == 2, 2, totale_non_vendibili)
        
        # Test 4: Check for SCIENZE with "EDIZIONE CAMBIATA"
        non_vendibili = vendere.get("libri_non_vendibili", [])
        scienze_found = False
        italiano_found = False
        
        for libro in non_vendibili:
            disciplina = libro.get("disciplina", "").upper()
            status = libro.get("status", "")
            
            if "SCIENZE" in disciplina:
                scienze_found = True
                check_test("SCIENZE Edition Changed", "EDIZIONE CAMBIATA" in status, "EDIZIONE CAMBIATA", status)
            elif "ITALIANO" in disciplina:
                italiano_found = True
                check_test("ITALIANO Different Publisher", "EDIZIONE CAMBIATA" in status, "EDIZIONE CAMBIATA", status)
        
        check_test("SCIENZE Found in Non Vendibili", scienze_found)
        check_test("ITALIANO Found in Non Vendibili", italiano_found)
        
        # Test 5: COMPRARE section (from 3rd grade)  
        comprare = data["comprare"]
        totale_usati = comprare.get("totale_usati", 0)
        
        check_test("Usati Count (~5)", 4 <= totale_usati <= 6, "4-6", totale_usati)
        
        # Check for SCIENZE and ITALIANO in usati
        libri_usati = comprare.get("libri_usati", [])
        scienze_usato = False
        italiano_usato = False
        
        for libro in libri_usati:
            disciplina = libro.get("disciplina", "").upper()
            if "SCIENZE" in disciplina:
                scienze_usato = True
            elif "ITALIANO" in disciplina:
                italiano_usato = True
        
        check_test("SCIENZE Available Used", scienze_usato)
        check_test("ITALIANO Available Used", italiano_usato)
        
        # Test 6: NUOVI section (books to buy new)
        nuovi = data["nuovi"]
        totale_nuovi = nuovi.get("totale", 0)
        
        check_test("Nuovi Count (2)", totale_nuovi == 2, 2, totale_nuovi)
        
        # Check for FRANCESE and MATEMATICA
        libri_nuovi = nuovi.get("libri", [])
        francese_found = False
        matematica_found = False
        
        for libro in libri_nuovi:
            disciplina = libro.get("disciplina", "").upper()
            motivo = libro.get("motivo", "")
            
            if "FRANCESE" in disciplina:
                francese_found = True
                check_test("FRANCESE Edition Reason", "diversa dalla" in motivo.lower(), "Contains 'diversa dalla'", motivo)
            elif "MATEMATICA" in disciplina:
                matematica_found = True
        
        check_test("FRANCESE Found in Nuovi", francese_found)
        check_test("MATEMATICA Found in Nuovi", matematica_found)
        
        # Test 7: Summary Section
        summary = data.get("summary", {})
        check_test("Summary Section Present", isinstance(summary, dict))
        
        print("\n" + "="*80)
        print("📊 DETAILED API RESPONSE ANALYSIS:")
        print("="*80)
        
        print(f"User Class: {data.get('user_classe', 'N/A')}")
        print(f"School: {data.get('scuola', 'N/A')}")
        print(f"School Code: {data.get('codice_scuola', 'N/A')}")
        
        print(f"\n📈 VENDERE (to 1st grade):")
        print(f"  Totale Vendibili: {vendere.get('totale_vendibili', 0)}")
        print(f"  Totale Non Vendibili: {vendere.get('totale_non_vendibili', 0)}")
        
        if non_vendibili:
            print("  Non Vendibili Details:")
            for libro in non_vendibili:
                disciplina = libro.get('disciplina', 'N/A')
                status = libro.get('status', 'N/A')
                print(f"    - {disciplina}: {status}")
        
        print(f"\n📉 COMPRARE (from 3rd grade):")
        print(f"  Totale Usati: {comprare.get('totale_usati', 0)}")
        print(f"  Risparmio Totale: €{comprare.get('risparmio_totale', 0)}")
        
        print(f"\n🆕 NUOVI (buy new):")
        print(f"  Totale: {nuovi.get('totale', 0)}")
        print(f"  Costo Totale: €{nuovi.get('costo_totale', 0)}")
        
        if libri_nuovi:
            print("  Nuovi Details:")
            for libro in libri_nuovi:
                disciplina = libro.get('disciplina', 'N/A')
                motivo = libro.get('motivo', 'N/A')
                prezzo = libro.get('prezzo', 0)
                print(f"    - {disciplina}: €{prezzo} ({motivo})")
        
        print("\n" + "="*80)
        print(f"TEST RESULTS: {tests_passed}/{tests_total} PASSED ({tests_passed/tests_total*100:.1f}%)")
        print("="*80)
        
        if tests_passed == tests_total:
            print("🎉 ALL CLASS COMPATIBILITY TESTS PASSED!")
            return True
        else:
            print("⚠️  SOME TESTS FAILED - Review details above")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Network Error: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ JSON Parse Error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
        return False

def main():
    """Run the class compatibility test"""
    print("🚀 ScambiaLibri Class Compatibility API Test")
    print(f"Testing against: {BASE_URL}")
    print("="*80)
    
    success = test_class_compatibility()
    
    if success:
        print("\n✅ Class Compatibility API Test SUCCESSFUL")
        return 0
    else:
        print("\n❌ Class Compatibility API Test FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())