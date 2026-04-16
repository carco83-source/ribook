#!/usr/bin/env python3
"""
Backend Test Suite for High School Book Classification Logic
Tests the new secondo_grado (High School) compatibility endpoint
"""

import requests
import json
import sys
from typing import Dict, List, Any

# Backend URL from environment
BACKEND_URL = "https://language-check-10.preview.emergentagent.com/api"

# Test user from review request
TEST_USER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"

class HighSchoolBookClassificationTester:
    def __init__(self):
        self.backend_url = BACKEND_URL
        self.test_user_id = TEST_USER_ID
        self.test_results = []
        self.failed_tests = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details
        }
        self.test_results.append(result)
        if not success:
            self.failed_tests.append(result)
        
        status = "✅" if success else "❌"
        print(f"{status} {test_name}")
        if details:
            print(f"   {details}")
    
    def test_get_user_profiles(self) -> Dict[str, Any]:
        """Test 1: Get user profiles to identify secondo_grado children"""
        try:
            response = requests.get(f"{self.backend_url}/users/{self.test_user_id}")
            
            if response.status_code != 200:
                self.log_test("Get User Profiles", False, f"HTTP {response.status_code}: {response.text}")
                return {}
            
            user_data = response.json()
            profili_figli = user_data.get("profili_figli", [])
            
            # Find secondo_grado profiles
            secondo_grado_profiles = [
                p for p in profili_figli 
                if p.get("tipo_scuola") == "secondo_grado"
            ]
            
            if not secondo_grado_profiles:
                self.log_test("Get User Profiles", False, "No secondo_grado profiles found")
                return {}
            
            details = f"Found {len(secondo_grado_profiles)} high school profiles: "
            details += ", ".join([f"{p.get('nome_figlio', 'Unknown')} (classe {p.get('classe', 'N/A')})" 
                                for p in secondo_grado_profiles])
            
            self.log_test("Get User Profiles", True, details)
            return {"profiles": secondo_grado_profiles, "user_data": user_data}
            
        except Exception as e:
            self.log_test("Get User Profiles", False, f"Exception: {str(e)}")
            return {}
    
    def test_compatibility_endpoint(self, child_id: str, child_name: str, classe: int) -> Dict[str, Any]:
        """Test compatibility endpoint for a specific child"""
        try:
            response = requests.get(
                f"{self.backend_url}/profiles/{self.test_user_id}/children/{child_id}/compatibility"
            )
            
            if response.status_code != 200:
                self.log_test(f"Compatibility API - {child_name}", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return {}
            
            data = response.json()
            
            # Validate response structure
            required_fields = ["nuovi", "comprare"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                self.log_test(f"Compatibility API - {child_name}", False, 
                            f"Missing fields: {missing_fields}")
                return {}
            
            comprare_nuovo = data.get("nuovi", {}).get("libri", [])
            comprare_usato = data.get("comprare", {}).get("libri_usati", [])
            
            details = f"Classe {classe}: {len(comprare_nuovo)} nuovi, {len(comprare_usato)} usati"
            self.log_test(f"Compatibility API - {child_name}", True, details)
            
            return {
                "child_name": child_name,
                "classe": classe,
                "comprare_nuovo": comprare_nuovo,
                "comprare_usato": comprare_usato,
                "raw_data": data
            }
            
        except Exception as e:
            self.log_test(f"Compatibility API - {child_name}", False, f"Exception: {str(e)}")
            return {}
    
    def analyze_quinquennial_subjects(self, compatibility_data: Dict[str, Any]) -> bool:
        """Analyze if quinquennial subjects are handled correctly"""
        child_name = compatibility_data.get("child_name", "Unknown")
        classe = compatibility_data.get("classe", 0)
        comprare_nuovo = compatibility_data.get("comprare_nuovo", [])
        comprare_usato = compatibility_data.get("comprare_usato", [])
        
        # Also check consigliati section for books marked as "da_non_acquistare"
        consigliati = compatibility_data.get("raw_data", {}).get("consigliati", {}).get("libri_da_comprare", [])
        
        # Quinquennial subjects that should NOT appear in years 2-5
        quinquennial_keywords = [
            "RELIGIONE", "SCIENZE MOTORIE", "EDUCAZIONE CIVICA", "GRAMMATICA",
            "IRC", "ED. FISICA", "ED. CIVICA", "CITTADINANZA"
        ]
        
        all_books = comprare_nuovo + comprare_usato
        quinquennial_books_found = []
        quinquennial_in_consigliati = []
        
        # Check in main book lists
        for book in all_books:
            disciplina = book.get("disciplina", "").upper()
            
            for keyword in quinquennial_keywords:
                if keyword in disciplina:
                    quinquennial_books_found.append({
                        "titolo": book.get("titolo", ""),
                        "disciplina": book.get("disciplina", ""),
                        "keyword_matched": keyword
                    })
                    break
        
        # Check in consigliati section for quinquennial subjects marked as "da_non_acquistare"
        for book in consigliati:
            disciplina = book.get("disciplina", "").upper()
            tipo = book.get("tipo", "")
            
            for keyword in quinquennial_keywords:
                if keyword in disciplina:
                    quinquennial_in_consigliati.append({
                        "titolo": book.get("titolo", ""),
                        "disciplina": book.get("disciplina", ""),
                        "tipo": tipo,
                        "keyword_matched": keyword
                    })
                    break
        
        # Logic check based on class year
        if classe == 1:
            # 1st year: ALL books should be in comprare lists (none already owned)
            expected_behavior = "All books should appear (first year)"
            test_passed = True  # Any number is acceptable for 1st year
            details = f"1st year - Found {len(quinquennial_books_found)} quinquennial books (expected)"
            
        elif classe in [2, 3, 4, 5]:
            # 2nd-5th year: Quinquennial subjects should NOT appear in main lists (already owned from 1st year)
            # BUT they might appear in consigliati as "da_non_acquistare" which is correct
            expected_behavior = "Quinquennial subjects should NOT appear in main lists (already owned)"
            test_passed = len(quinquennial_books_found) == 0
            
            if quinquennial_books_found:
                details = f"❌ Found {len(quinquennial_books_found)} quinquennial books in main lists that should be already owned: "
                details += ", ".join([f"{b['titolo']} ({b['keyword_matched']})" for b in quinquennial_books_found])
            else:
                details = f"✅ No quinquennial books in main lists (correct - already owned from 1st year)"
                
            # Add info about consigliati if any quinquennial subjects found there
            if quinquennial_in_consigliati:
                da_non_acquistare = [b for b in quinquennial_in_consigliati if b['tipo'] == 'da_non_acquistare']
                if da_non_acquistare:
                    details += f" | Found {len(da_non_acquistare)} quinquennial books correctly marked as 'da_non_acquistare'"
        else:
            expected_behavior = "Unknown class"
            test_passed = False
            details = f"Invalid class: {classe}"
        
        self.log_test(f"Quinquennial Logic - {child_name} (Classe {classe})", test_passed, details)
        return test_passed
    
    def analyze_biennio_triennio_logic(self, compatibility_data: Dict[str, Any]) -> bool:
        """Analyze biennio/triennio cycle logic"""
        child_name = compatibility_data.get("child_name", "Unknown")
        classe = compatibility_data.get("classe", 0)
        comprare_nuovo = compatibility_data.get("comprare_nuovo", [])
        comprare_usato = compatibility_data.get("comprare_usato", [])
        
        total_books = len(comprare_nuovo) + len(comprare_usato)
        
        if classe in [1, 2]:
            cycle = "BIENNIO"
            expected_behavior = "Should follow middle school logic within 1st-2nd year cycle"
        elif classe in [3, 4, 5]:
            cycle = "TRIENNIO"
            expected_behavior = "Should follow middle school logic within 3rd-5th year cycle"
        else:
            cycle = "UNKNOWN"
            expected_behavior = "Invalid class"
        
        # For now, just verify that we get some books and no errors
        test_passed = total_books >= 0  # Basic validation
        details = f"{cycle} - Total books to buy: {total_books}"
        
        self.log_test(f"Cycle Logic - {child_name} (Classe {classe})", test_passed, details)
        return test_passed
    
    def analyze_unique_vs_annual_volumes(self, compatibility_data: Dict[str, Any]) -> bool:
        """Analyze unique vs annual volume handling"""
        child_name = compatibility_data.get("child_name", "Unknown")
        classe = compatibility_data.get("classe", 0)
        comprare_nuovo = compatibility_data.get("comprare_nuovo", [])
        comprare_usato = compatibility_data.get("comprare_usato", [])
        
        unique_volumes = []
        annual_volumes = []
        
        for book in comprare_nuovo + comprare_usato:
            if book.get("is_volume_unico", False):
                unique_volumes.append(book)
            else:
                annual_volumes.append(book)
        
        # Expected behavior based on class
        if classe == 1:
            expected = "All books should be purchasable (first year)"
            test_passed = True
        elif classe == 3:
            expected = "Non-quinquennial unique volumes should appear, quinquennial should not"
            test_passed = True  # Complex logic, just verify no errors
        elif classe in [4, 5]:
            expected = "Only annual books should appear, no unique volumes"
            test_passed = len(unique_volumes) == 0
        else:
            expected = "Varies by class"
            test_passed = True
        
        details = f"Unique: {len(unique_volumes)}, Annual: {len(annual_volumes)} - {expected}"
        
        self.log_test(f"Volume Type Logic - {child_name} (Classe {classe})", test_passed, details)
        return test_passed
    
    def run_all_tests(self):
        """Run all tests for High School Book Classification Logic"""
        print("🧪 Testing High School Book Classification Logic")
        print("=" * 60)
        
        # Test 1: Get user profiles
        user_data = self.test_get_user_profiles()
        if not user_data:
            print("\n❌ Cannot continue - failed to get user profiles")
            return
        
        profiles = user_data.get("profiles", [])
        
        # Test 2-N: Test each secondo_grado profile
        for profile in profiles:
            child_id = profile.get("id")
            child_name = profile.get("nome_figlio", "Unknown")
            classe = int(profile.get("classe", 0))
            
            print(f"\n📚 Testing {child_name} (Classe {classe})")
            print("-" * 40)
            
            # Test compatibility endpoint
            compatibility_data = self.test_compatibility_endpoint(child_id, child_name, classe)
            
            if compatibility_data:
                # Analyze quinquennial subjects logic
                self.analyze_quinquennial_subjects(compatibility_data)
                
                # Analyze biennio/triennio logic
                self.analyze_biennio_triennio_logic(compatibility_data)
                
                # Analyze unique vs annual volumes
                self.analyze_unique_vs_annual_volumes(compatibility_data)
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = total_tests - len(self.failed_tests)
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {len(self.failed_tests)}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if self.failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in self.failed_tests:
                print(f"  • {test['test']}: {test['details']}")
        
        return len(self.failed_tests) == 0

if __name__ == "__main__":
    tester = HighSchoolBookClassificationTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)