#!/usr/bin/env python3
"""
ScambiaLibri Backend API Test Suite
Tests the textbook exchange platform backend APIs
"""

import requests
import json
import sys
from datetime import datetime

# Test Configuration
BASE_URL = "https://language-check-10.preview.emergentagent.com/api"

# Test data from the review request
EXISTING_USER = {
    "email": "marco@test.it", 
    "password": "test123",
    "user_id": "279bdfa8-8895-4ce5-b04e-ab046ae6928f"
}
EXISTING_LISTING_ID = "9ea62283-b7c0-458c-8e19-259a8b16b3f0"

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def pass_test(self, test_name):
        self.passed += 1
        print(f"✅ {test_name}")
        
    def fail_test(self, test_name, error):
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        print(f"❌ {test_name}: {error}")
        
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"BACKEND API TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {total}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Success Rate: {(self.passed/total*100):.1f}%" if total > 0 else "0.0%")
        
        if self.errors:
            print(f"\nFAILURES:")
            for error in self.errors:
                print(f"  • {error}")
        
        return self.failed == 0

def make_request(method, endpoint, data=None, params=None, headers=None):
    """Make HTTP request with proper error handling"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, headers=headers, timeout=10)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, params=params, headers=headers, timeout=10)
        elif method.upper() == "DELETE":
            response = requests.delete(url, params=params, headers=headers, timeout=10)
        else:
            raise ValueError(f"Unsupported method: {method}")
            
        return response
    except requests.exceptions.RequestException as e:
        return None, str(e)

def test_user_authentication(results):
    """Test user login functionality"""
    print("\n🔐 Testing User Authentication...")
    
    # Test login with existing user
    login_data = {
        "email": EXISTING_USER["email"],
        "password": EXISTING_USER["password"]
    }
    
    response = make_request("POST", "/auth/login", login_data)
    if response is None:
        results.fail_test("User Login", "Request failed - server unreachable")
        return None
        
    if response.status_code == 200:
        login_result = response.json()
        if "user_id" in login_result and login_result["user_id"] == EXISTING_USER["user_id"]:
            results.pass_test("User Login")
            return login_result
        else:
            results.fail_test("User Login", f"Invalid login response: {login_result}")
    else:
        results.fail_test("User Login", f"Status {response.status_code}: {response.text}")
    
    return None

def create_test_user(results):
    """Create a second test user for matching tests"""
    print("\n👤 Creating Second Test User...")
    
    user_data = {
        "nome": "Test",
        "cognome": "Buyer",
        "email": "testbuyer@scambia.it",
        "telefono": "3331234567",
        "password": "testpass123",
        "scuola": "Liceo Scientifico Galilei",
        "classe": "3",
        "sezione": "A"
    }
    
    response = make_request("POST", "/auth/register", user_data)
    if response is None:
        results.fail_test("Create Test User", "Request failed")
        return None
        
    if response.status_code == 200:
        result = response.json()
        if "user_id" in result:
            results.pass_test("Create Test User")
            
            # Login to get full user data
            login_data = {"email": user_data["email"], "password": user_data["password"]}
            login_response = make_request("POST", "/auth/login", login_data)
            if login_response and login_response.status_code == 200:
                return login_response.json()
                
        results.fail_test("Create Test User", f"Invalid response: {result}")
    elif response.status_code == 400:
        response_text = response.text
        if ("già registrada" in response_text or "already" in response_text or "Email già registrata" in response_text):
            # User already exists, try login instead
            login_data = {"email": user_data["email"], "password": user_data["password"]}
            login_response = make_request("POST", "/auth/login", login_data)
            if login_response and login_response.status_code == 200:
                results.pass_test("Create Test User (using existing)")
                return login_response.json()
            else:
                results.fail_test("Create Test User", f"Login failed for existing user: {login_response.status_code if login_response else 'None'}")
        else:
            results.fail_test("Create Test User", f"Status {response.status_code}: {response.text}")
    else:
        results.fail_test("Create Test User", f"Status {response.status_code}: {response.text}")
    
    return None

def get_available_books(results):
    """Get available books for testing"""
    print("\n📚 Fetching Available Books...")
    
    response = make_request("GET", "/books")
    if response is None:
        results.fail_test("Get Books", "Request failed")
        return []
        
    if response.status_code == 200:
        books = response.json()
        if books and len(books) > 0:
            results.pass_test("Get Books")
            return books[:3]  # Return first 3 books for testing
        else:
            results.fail_test("Get Books", "No books found in database")
    else:
        results.fail_test("Get Books", f"Status {response.status_code}: {response.text}")
    
    return []

def get_available_bookstores(results):
    """Get available bookstores for testing"""
    print("\n🏪 Fetching Available Bookstores...")
    
    response = make_request("GET", "/bookstores")
    if response is None:
        results.fail_test("Get Bookstores", "Request failed")
        return []
        
    if response.status_code == 200:
        bookstores = response.json()
        if bookstores and len(bookstores) > 0:
            results.pass_test("Get Bookstores")
            return bookstores
        else:
            results.fail_test("Get Bookstores", "No bookstores found")
    else:
        results.fail_test("Get Bookstores", f"Status {response.status_code}: {response.text}")
    
    return []

def test_book_requests(results, user_data, books):
    """Test book request functionality"""
    print("\n📖 Testing Book Requests...")
    
    if not books:
        results.fail_test("Book Requests - No Books", "No books available for testing")
        return
    
    user_id = user_data["user_id"]
    test_book = books[0]  # Use first book
    
    # Test creating a book request
    request_data = {"book_id": test_book["id"]}
    params = {"user_id": user_id}
    
    response = make_request("POST", "/requests", request_data, params)
    if response is None:
        results.fail_test("Create Book Request", "Request failed")
        return
        
    if response.status_code == 200:
        request_result = response.json()
        if "id" in request_result and request_result["buyer_id"] == user_id:
            results.pass_test("Create Book Request")
            
            # Test getting user's requests
            response = make_request("GET", f"/requests/user/{user_id}")
            if response and response.status_code == 200:
                user_requests = response.json()
                if user_requests and len(user_requests) > 0:
                    results.pass_test("Get User Requests")
                else:
                    results.fail_test("Get User Requests", "No requests found for user")
            else:
                results.fail_test("Get User Requests", f"Status {response.status_code if response else 'None'}")
        else:
            results.fail_test("Create Book Request", f"Invalid response: {request_result}")
    else:
        results.fail_test("Create Book Request", f"Status {response.status_code}: {response.text}")

def test_matching_system(results, user_data):
    """Test matching/radar system"""
    print("\n🎯 Testing Matching/Radar System...")
    
    user_id = user_data["user_id"]
    
    # Test getting matches for user
    response = make_request("GET", f"/matches/{user_id}")
    if response is None:
        results.fail_test("Get Matches", "Request failed")
    elif response.status_code == 200:
        matches_result = response.json()
        if "matches" in matches_result and "total" in matches_result:
            results.pass_test("Get Matches")
        else:
            results.fail_test("Get Matches", f"Invalid response format: {matches_result}")
    else:
        results.fail_test("Get Matches", f"Status {response.status_code}: {response.text}")
    
    # Test radar view
    response = make_request("GET", f"/radar/{user_id}")
    if response is None:
        results.fail_test("Get Radar View", "Request failed")
    elif response.status_code == 200:
        radar_result = response.json()
        expected_keys = ["total_matches", "same_section", "same_class", "same_school", "others", "books_searching"]
        if all(key in radar_result for key in expected_keys):
            results.pass_test("Get Radar View")
        else:
            results.fail_test("Get Radar View", f"Missing expected keys in response: {radar_result}")
    else:
        results.fail_test("Get Radar View", f"Status {response.status_code}: {response.text}")

def test_transactions(results, buyer_data, bookstores):
    """Test transaction creation and commission calculation"""
    print("\n💰 Testing Transactions...")
    
    if not bookstores:
        results.fail_test("Transactions - No Bookstores", "No bookstores available for testing")
        return
    
    # First, get a book and create a listing from the original user
    books_response = make_request("GET", "/books")
    if not books_response or books_response.status_code != 200:
        results.fail_test("Transactions - No Books", "Could not get books for listing")
        return
    
    books = books_response.json()
    if not books:
        results.fail_test("Transactions - No Books", "No books available")
        return
    
    test_book = books[0]  # Use first book
    
    # Create a listing using the existing user (marco@test.it)
    listing_data = {
        "book_id": test_book["id"],
        "condizione": "come_nuovo",
        "note": "Test listing for transaction"
    }
    params = {"user_id": EXISTING_USER["user_id"]}
    
    listing_response = make_request("POST", "/listings", listing_data, params)
    if not listing_response or listing_response.status_code != 200:
        results.fail_test("Create Transaction", f"Could not create test listing: {listing_response.status_code if listing_response else 'None'}")
        return
    
    listing = listing_response.json()
    
    buyer_id = buyer_data["user_id"]
    bookstore = bookstores[0]  # Use first bookstore
    
    # Test creating a transaction with the new listing
    transaction_data = {
        "listing_id": listing["id"],
        "bookstore_id": bookstore["id"]
    }
    params = {"user_id": buyer_id}
    
    response = make_request("POST", "/transactions", transaction_data, params)
    if response is None:
        results.fail_test("Create Transaction", "Request failed")
        return
        
    if response.status_code == 200:
        transaction = response.json()
        
        # Check transaction structure
        required_fields = ["id", "buyer_id", "seller_id", "prezzo_totale", "commissione_app", "importo_venditore"]
        if all(field in transaction for field in required_fields):
            
            # Test commission calculation for free user (should be 15% total)
            prezzo = transaction["prezzo_totale"]
            commissione_app = transaction["commissione_app"]
            is_premium = transaction.get("buyer_is_premium", False)
            
            if not is_premium and commissione_app > 0:
                # For free users, app commission should be around 10% (15% total - 5% bookstore)
                expected_commission = prezzo * 0.10  # Approximate
                if abs(commissione_app - expected_commission) < 1.0:  # Allow small rounding differences
                    results.pass_test("Create Transaction (Commission Check)")
                else:
                    results.fail_test("Create Transaction (Commission Check)", 
                                     f"Expected ~{expected_commission:.2f}, got {commissione_app}")
            else:
                results.pass_test("Create Transaction")
            
            # Test getting user transactions
            response = make_request("GET", f"/transactions/user/{buyer_id}")
            if response and response.status_code == 200:
                user_transactions = response.json()
                if "acquisti" in user_transactions and "vendite" in user_transactions:
                    results.pass_test("Get User Transactions")
                else:
                    results.fail_test("Get User Transactions", "Invalid response format")
            else:
                results.fail_test("Get User Transactions", f"Status {response.status_code if response else 'None'}")
                
        else:
            results.fail_test("Create Transaction", f"Missing required fields in response: {transaction}")
    else:
        results.fail_test("Create Transaction", f"Status {response.status_code}: {response.text}")

def test_class_compatibility(results):
    """Test the class compatibility API endpoint for ScambiaLibri app"""
    print("\n🎯 Testing Class Compatibility API...")
    
    # Test with the specific user ID from the test request
    test_user_id = "58ac430d-da2a-4954-bb2f-feea6de1f30c"
    
    response = make_request("GET", f"/radar/{test_user_id}/class-compatibility")
    if response is None:
        results.fail_test("Class Compatibility API - Request", "Request failed - server unreachable")
        return
        
    if response.status_code == 200:
        compatibility_data = response.json()
        
        # Check basic response structure
        required_sections = ["vendere", "comprare", "nuovi", "summary"]
        missing_sections = [section for section in required_sections if section not in compatibility_data]
        
        if missing_sections:
            results.fail_test("Class Compatibility API - Structure", f"Missing sections: {missing_sections}")
            return
        
        # Test VENDERE section (to 1st grade)
        vendere = compatibility_data["vendere"]
        required_vendere_fields = ["totale_vendibili", "totale_non_vendibili", "libri_vendibili", "libri_non_vendibili"]
        
        if all(field in vendere for field in required_vendere_fields):
            # Check expected numbers based on test request
            totale_vendibili = vendere["totale_vendibili"]
            totale_non_vendibili = vendere["totale_non_vendibili"]
            
            # Expected: around 5 vendibili, 2 non vendibili
            if 4 <= totale_vendibili <= 6:
                results.pass_test("Class Compatibility - Vendibili Count")
            else:
                results.fail_test("Class Compatibility - Vendibili Count", 
                                f"Expected ~5 vendibili, got {totale_vendibili}")
            
            if totale_non_vendibili == 2:
                results.pass_test("Class Compatibility - Non Vendibili Count")
            else:
                results.fail_test("Class Compatibility - Non Vendibili Count", 
                                f"Expected 2 non vendibili, got {totale_non_vendibili}")
                
            # Check for SCIENZE with "EDIZIONE CAMBIATA" status
            non_vendibili = vendere["libri_non_vendibili"]
            scienze_found = False
            italiano_found = False
            
            for libro in non_vendibili:
                disciplina = libro.get("disciplina", "").upper()
                status = libro.get("status", "")
                
                if "SCIENZE" in disciplina:
                    scienze_found = True
                    if "EDIZIONE CAMBIATA" in status:
                        results.pass_test("Class Compatibility - SCIENZE Edition Check")
                    else:
                        results.fail_test("Class Compatibility - SCIENZE Edition Check", 
                                        f"Expected 'EDIZIONE CAMBIATA' for SCIENZE, got '{status}'")
                
                elif "ITALIANO" in disciplina:
                    italiano_found = True
                    results.pass_test("Class Compatibility - ITALIANO Publisher Check")
            
            if not scienze_found:
                results.fail_test("Class Compatibility - SCIENZE Found", "SCIENZE not found in non_vendibili")
            if not italiano_found:
                results.fail_test("Class Compatibility - ITALIANO Found", "ITALIANO not found in non_vendibili")
                
        else:
            results.fail_test("Class Compatibility - Vendere Structure", 
                            f"Missing vendere fields: {[f for f in required_vendere_fields if f not in vendere]}")
        
        # Test COMPRARE section (from 3rd grade)
        comprare = compatibility_data["comprare"]
        required_comprare_fields = ["totale_usati", "libri_usati"]
        
        if all(field in comprare for field in required_comprare_fields):
            totale_usati = comprare["totale_usati"]
            
            # Expected: around 5 usati
            if 4 <= totale_usati <= 6:
                results.pass_test("Class Compatibility - Usati Count")
            else:
                results.fail_test("Class Compatibility - Usati Count", 
                                f"Expected ~5 usati, got {totale_usati}")
                
            # Check for SCIENZE and ITALIANO in libri_usati
            libri_usati = comprare["libri_usati"]
            scienze_usato = False
            italiano_usato = False
            
            for libro in libri_usati:
                disciplina = libro.get("disciplina", "").upper()
                if "SCIENZE" in disciplina:
                    scienze_usato = True
                elif "ITALIANO" in disciplina:
                    italiano_usato = True
            
            if scienze_usato:
                results.pass_test("Class Compatibility - SCIENZE Available Used")
            else:
                results.fail_test("Class Compatibility - SCIENZE Available Used", "SCIENZE not found in libri_usati")
                
            if italiano_usato:
                results.pass_test("Class Compatibility - ITALIANO Available Used")
            else:
                results.fail_test("Class Compatibility - ITALIANO Available Used", "ITALIANO not found in libri_usati")
                
        else:
            results.fail_test("Class Compatibility - Comprare Structure", 
                            f"Missing comprare fields: {[f for f in required_comprare_fields if f not in comprare]}")
        
        # Test NUOVI section (books to buy new)
        nuovi = compatibility_data["nuovi"]
        required_nuovi_fields = ["totale", "libri"]
        
        if all(field in nuovi for field in required_nuovi_fields):
            totale_nuovi = nuovi["totale"]
            
            # Expected: 2 books to buy new
            if totale_nuovi == 2:
                results.pass_test("Class Compatibility - Nuovi Count")
            else:
                results.fail_test("Class Compatibility - Nuovi Count", 
                                f"Expected 2 nuovi, got {totale_nuovi}")
                
            # Check for FRANCESE and MATEMATICA
            libri_nuovi = nuovi["libri"]
            francese_found = False
            matematica_found = False
            
            for libro in libri_nuovi:
                disciplina = libro.get("disciplina", "").upper()
                motivo = libro.get("motivo", "")
                
                if "FRANCESE" in disciplina:
                    francese_found = True
                    if "diversa dalla" in motivo.lower():
                        results.pass_test("Class Compatibility - FRANCESE Edition Reason")
                    else:
                        results.fail_test("Class Compatibility - FRANCESE Edition Reason", 
                                        f"Expected edition difference reason for FRANCESE, got '{motivo}'")
                
                elif "MATEMATICA" in disciplina:
                    matematica_found = True
                    results.pass_test("Class Compatibility - MATEMATICA Found")
            
            if not francese_found:
                results.fail_test("Class Compatibility - FRANCESE Found", "FRANCESE not found in nuovi")
            if not matematica_found:
                results.fail_test("Class Compatibility - MATEMATICA Found", "MATEMATICA not found in nuovi")
                
        else:
            results.fail_test("Class Compatibility - Nuovi Structure", 
                            f"Missing nuovi fields: {[f for f in required_nuovi_fields if f not in nuovi]}")
        
        # Test summary section
        summary = compatibility_data["summary"]
        if isinstance(summary, dict):
            results.pass_test("Class Compatibility - Summary Structure")
        else:
            results.fail_test("Class Compatibility - Summary Structure", "Summary is not a dictionary")
        
        # Overall API success
        results.pass_test("Class Compatibility API - Overall Response")
        
        # Print detailed analysis for debugging
        print("\n📊 Class Compatibility Analysis:")
        print(f"   User Class: {compatibility_data.get('user_classe', 'N/A')}")
        print(f"   School: {compatibility_data.get('scuola', 'N/A')}")
        print(f"   School Code: {compatibility_data.get('codice_scuola', 'N/A')}")
        print(f"   Vendibili: {vendere.get('totale_vendibili', 0)}")
        print(f"   Non Vendibili: {vendere.get('totale_non_vendibili', 0)}")
        print(f"   Usati Disponibili: {comprare.get('totale_usati', 0)}")
        print(f"   Da Comprare Nuovi: {nuovi.get('totale', 0)}")
        
        if vendere.get('libri_non_vendibili'):
            print("\n   Non Vendibili Details:")
            for libro in vendere['libri_non_vendibili'][:3]:  # Show first 3
                print(f"     - {libro.get('disciplina', 'N/A')}: {libro.get('status', 'N/A')}")
        
    elif response.status_code == 404:
        results.fail_test("Class Compatibility API - User Not Found", 
                        f"User ID {test_user_id} not found in database")
    else:
        results.fail_test("Class Compatibility API - Status Code", 
                        f"Expected 200, got {response.status_code}: {response.text}")

def test_premium_upgrade(results, user_data):
    """Test premium upgrade functionality"""
    print("\n⭐ Testing Premium Upgrade...")
    
    user_id = user_data["user_id"]
    
    response = make_request("POST", f"/users/{user_id}/upgrade-premium")
    if response is None:
        results.fail_test("Premium Upgrade", "Request failed")
    elif response.status_code == 200:
        upgrade_result = response.json()
        if "message" in upgrade_result and "scadenza" in upgrade_result:
            results.pass_test("Premium Upgrade")
            
            # Verify user is now premium by getting user data
            response = make_request("GET", f"/users/{user_id}")
            if response and response.status_code == 200:
                user_info = response.json()
                if user_info.get("is_premium", False):
                    results.pass_test("Premium Status Verification")
                else:
                    results.fail_test("Premium Status Verification", "User not marked as premium")
            else:
                results.fail_test("Premium Status Verification", "Failed to get user info")
        else:
            results.fail_test("Premium Upgrade", f"Invalid response: {upgrade_result}")
    else:
        results.fail_test("Premium Upgrade", f"Status {response.status_code}: {response.text}")

def main():
    """Run all backend tests"""
    print("🚀 Starting ScambiaLibri Backend API Tests")
    print(f"Testing against: {BASE_URL}")
    print("="*60)
    
    results = TestResults()
    
    # Test existing user login
    existing_user = test_user_authentication(results)
    if not existing_user:
        print("\n❌ Cannot proceed without valid user authentication")
        return False
    
    # Create second test user for matching
    test_buyer = create_test_user(results)
    if not test_buyer:
        print("\n❌ Cannot proceed without second test user")
        return False
    
    # Get test data
    books = get_available_books(results)
    bookstores = get_available_bookstores(results)
    
    # Run core functionality tests
    test_book_requests(results, test_buyer, books)
    test_matching_system(results, test_buyer)
    test_class_compatibility(results)
    test_transactions(results, test_buyer, bookstores)
    test_premium_upgrade(results, test_buyer)
    
    # Print final summary
    success = results.summary()
    
    print(f"\n{'='*60}")
    if success:
        print("🎉 ALL BACKEND TESTS PASSED!")
    else:
        print("⚠️  SOME BACKEND TESTS FAILED - Review above for details")
    print(f"{'='*60}")
    
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)