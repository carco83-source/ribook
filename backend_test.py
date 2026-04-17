#!/usr/bin/env python3
"""
Backend Testing for ScambiaLibri - Radar View and Cart Duplicate Prevention
Testing the fixes for:
1. Radar View Missing Data - compatibility endpoint vendere structure
2. Cart Duplicate Orders - order creation duplicate prevention
"""

import requests
import json
import sys
import os
from datetime import datetime

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://language-check-10.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials from review request
TEST_USER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"
TEST_CHILDREN = {
    "goja": "bb7aaaf8-1ab2-40a9-9709-ef84da7eb54d",  # Goja, 3° Scalfaro
    "carmen": "66ff6294-5695-4a67-bf92-798643a50ef2",  # Carmen, 1° media
    "george": "george-profile-001",  # George, 2° media
    "aldo": "bde1f85a-511c-43eb-a310-4c004ea4f298"  # Aldo, 3° Liceo
}

class TestResults:
    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.results = []
    
    def add_result(self, test_name, passed, details=""):
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
            status = "✅ PASS"
        else:
            self.failed_tests += 1
            status = "❌ FAIL"
        
        result = f"{status} - {test_name}"
        if details:
            result += f" | {details}"
        
        self.results.append(result)
        print(result)
    
    def print_summary(self):
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {self.total_tests}")
        print(f"Passed: {self.passed_tests}")
        print(f"Failed: {self.failed_tests}")
        print(f"Success Rate: {(self.passed_tests/self.total_tests*100):.1f}%")
        print(f"{'='*60}")

def test_compatibility_endpoint_vendere_structure():
    """Test 1: Compatibility endpoint returns correct vendere structure"""
    print(f"\n🔍 TEST 1: Compatibility endpoint vendere structure for Goja")
    
    url = f"{API_BASE}/profiles/{TEST_USER_ID}/children/{TEST_CHILDREN['goja']}/compatibility"
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check if vendere object exists
        if "vendere" not in data:
            return False, "Missing 'vendere' object in response"
        
        vendere = data["vendere"]
        
        # Check required fields in vendere
        required_fields = ["libri_vendibili", "libri_non_vendibili", "totale_non_vendibili"]
        missing_fields = []
        
        for field in required_fields:
            if field not in vendere:
                missing_fields.append(field)
        
        if missing_fields:
            return False, f"Missing fields in vendere: {missing_fields}"
        
        # Check libri_gia_posseduti
        if "libri_gia_posseduti" not in data:
            return False, "Missing 'libri_gia_posseduti' object in response"
        
        libri_gia_posseduti = data["libri_gia_posseduti"]
        if "libri" not in libri_gia_posseduti:
            return False, "Missing 'libri' in libri_gia_posseduti"
        
        # Verify data types
        if not isinstance(vendere["libri_vendibili"], list):
            return False, "libri_vendibili should be a list"
        
        if not isinstance(vendere["libri_non_vendibili"], list):
            return False, "libri_non_vendibili should be a list"
        
        if not isinstance(vendere["totale_non_vendibili"], (int, float)):
            return False, "totale_non_vendibili should be a number"
        
        if not isinstance(libri_gia_posseduti["libri"], list):
            return False, "libri_gia_posseduti.libri should be a list"
        
        # Check that we have 3 items in libri_gia_posseduti (volumi quinquennali)
        if len(libri_gia_posseduti["libri"]) != 3:
            return False, f"Expected 3 items in libri_gia_posseduti, got {len(libri_gia_posseduti['libri'])}"
        
        details = f"vendere.libri_vendibili: {len(vendere['libri_vendibili'])}, libri_non_vendibili: {len(vendere['libri_non_vendibili'])}, totale_non_vendibili: {vendere['totale_non_vendibili']}, libri_gia_posseduti: {len(libri_gia_posseduti['libri'])}"
        
        return True, details
        
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON response: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

def test_compatibility_endpoint_first_year():
    """Test 2: Compatibility endpoint for 1st year student (Carmen)"""
    print(f"\n🔍 TEST 2: Compatibility endpoint for Carmen (1st year)")
    
    url = f"{API_BASE}/profiles/{TEST_USER_ID}/children/{TEST_CHILDREN['carmen']}/compatibility"
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check vendere structure
        if "vendere" not in data:
            return False, "Missing 'vendere' object in response"
        
        vendere = data["vendere"]
        
        # For 1st year student, totale_vendibili should be 0 (no books to sell)
        if "totale_vendibili" not in vendere:
            return False, "Missing 'totale_vendibili' in vendere"
        
        if vendere["totale_vendibili"] != 0:
            return False, f"Expected totale_vendibili=0 for 1st year, got {vendere['totale_vendibili']}"
        
        # Check libri_gia_posseduti
        if "libri_gia_posseduti" not in data:
            return False, "Missing 'libri_gia_posseduti' object in response"
        
        libri_gia_posseduti = data["libri_gia_posseduti"]
        
        if "totale" not in libri_gia_posseduti:
            return False, "Missing 'totale' in libri_gia_posseduti"
        
        # For 1st year student, totale should be 0 (no books already owned)
        if libri_gia_posseduti["totale"] != 0:
            return False, f"Expected libri_gia_posseduti.totale=0 for 1st year, got {libri_gia_posseduti['totale']}"
        
        details = f"totale_vendibili: {vendere['totale_vendibili']}, libri_gia_posseduti.totale: {libri_gia_posseduti['totale']}"
        
        return True, details
        
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON response: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

def test_duplicate_order_prevention():
    """Test 3: Duplicate order prevention"""
    print(f"\n🔍 TEST 3: Duplicate order prevention")
    
    # First get an available listing
    listings_url = f"{API_BASE}/listings?status=available"
    
    try:
        response = requests.get(listings_url, timeout=30)
        
        if response.status_code != 200:
            return False, f"Failed to get listings: HTTP {response.status_code}"
        
        listings = response.json()
        
        if not listings or len(listings) == 0:
            return False, "No available listings found for testing"
        
        # Find a listing that's not from our test user (to avoid self-purchase error)
        test_buyer_id = "b513ee73-48da-4c3a-8e38-12cfe4b9e49e"
        available_listing = None
        
        for listing in listings:
            if listing.get("seller_id") != test_buyer_id:
                available_listing = listing
                break
        
        if not available_listing:
            return False, "No suitable listings found (all belong to test user)"
        
        listing_id = available_listing.get("id")
        
        if not listing_id:
            return False, "Listing missing ID field"
        
        # Try to create first order
        order_url = f"{API_BASE}/orders/create?user_id={test_buyer_id}&listing_id={listing_id}&bookstore_id=21d774b1-2fbe-4b21-ae5b-94d158df2f72"
        
        response1 = requests.post(order_url, timeout=30)
        
        if response1.status_code not in [200, 201]:
            return False, f"First order creation failed: HTTP {response1.status_code}: {response1.text}"
        
        # Try to create second order for the same listing (should fail)
        response2 = requests.post(order_url, timeout=30)
        
        if response2.status_code == 200 or response2.status_code == 201:
            return False, "Second order creation should have failed but succeeded"
        
        # Check if error message indicates duplicate prevention
        error_text = response2.text.lower()
        if ("già un ordine attivo" in error_text or 
            "già stato riservato" in error_text or 
            "già riservato" in error_text or
            "annuncio non disponibile" in error_text):
            return True, f"Duplicate order correctly prevented: {response2.status_code} - {response2.text}"
        else:
            return False, f"Unexpected error message: {response2.text}"
        
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON response: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

def test_all_profiles_compatibility():
    """Test 4: Verify all profiles have valid compatibility data"""
    print(f"\n🔍 TEST 4: All profiles compatibility data")
    
    results = []
    
    for name, child_id in TEST_CHILDREN.items():
        url = f"{API_BASE}/profiles/{TEST_USER_ID}/children/{child_id}/compatibility"
        
        try:
            response = requests.get(url, timeout=30)
            
            if response.status_code != 200:
                results.append(f"{name}: HTTP {response.status_code}")
                continue
            
            data = response.json()
            
            # Basic structure checks
            required_sections = ["vendere", "comprare", "nuovi", "libri_gia_posseduti"]
            missing_sections = []
            
            for section in required_sections:
                if section not in data:
                    missing_sections.append(section)
            
            if missing_sections:
                results.append(f"{name}: Missing sections {missing_sections}")
                continue
            
            # Check vendere structure
            vendere = data["vendere"]
            required_vendere_fields = ["libri_vendibili", "libri_non_vendibili", "totale_non_vendibili"]
            missing_vendere = [f for f in required_vendere_fields if f not in vendere]
            
            if missing_vendere:
                results.append(f"{name}: Missing vendere fields {missing_vendere}")
                continue
            
            results.append(f"{name}: ✅ Valid structure")
            
        except Exception as e:
            results.append(f"{name}: Error - {str(e)}")
    
    # Check if all profiles passed
    failed_profiles = [r for r in results if "✅" not in r]
    
    if failed_profiles:
        return False, f"Failed profiles: {'; '.join(failed_profiles)}"
    else:
        return True, f"All profiles valid: {'; '.join(results)}"

def main():
    """Run all tests"""
    print("🚀 Starting ScambiaLibri Backend Testing - Radar View & Cart Duplicate Prevention")
    print(f"Backend URL: {API_BASE}")
    print(f"Test User ID: {TEST_USER_ID}")
    
    results = TestResults()
    
    # Test 1: Compatibility endpoint vendere structure
    passed, details = test_compatibility_endpoint_vendere_structure()
    results.add_result("Compatibility endpoint vendere structure (Goja)", passed, details)
    
    # Test 2: Compatibility endpoint for 1st year student
    passed, details = test_compatibility_endpoint_first_year()
    results.add_result("Compatibility endpoint 1st year (Carmen)", passed, details)
    
    # Test 3: Duplicate order prevention
    passed, details = test_duplicate_order_prevention()
    results.add_result("Duplicate order prevention", passed, details)
    
    # Test 4: All profiles compatibility
    passed, details = test_all_profiles_compatibility()
    results.add_result("All profiles compatibility data", passed, details)
    
    # Print summary
    results.print_summary()
    
    # Return exit code based on results
    return 0 if results.failed_tests == 0 else 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)