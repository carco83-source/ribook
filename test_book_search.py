#!/usr/bin/env python3
"""
RiBook Backend Testing - Book Search API Endpoint
Tests the GET /api/books/search endpoint with various search queries.

Test Cases:
1. Search "matematica" - should return math books
2. Search "storia" - should return history books
3. Search "inglese" - should return english books
4. Verify scuole array contains school names
5. Verify classi array contains class identifiers
6. Verify all required fields are present
"""

import requests
import json
from datetime import datetime

# Backend URL
BASE_URL = "https://language-check-10.preview.emergentagent.com/api"

# Test results
test_results = []
test_count = 0
passed_count = 0
failed_count = 0

def log_test(test_name, passed, details=""):
    global test_count, passed_count, failed_count
    test_count += 1
    if passed:
        passed_count += 1
        status = "✅ PASS"
    else:
        failed_count += 1
        status = "❌ FAIL"
    
    result = f"{status} - Test {test_count}: {test_name}"
    if details:
        result += f"\n    Details: {details}"
    print(result)
    test_results.append({"test": test_name, "passed": passed, "details": details})
    return passed

def verify_book_structure(book, search_term):
    """Verify that a book has all required fields"""
    required_fields = ["isbn", "titolo", "autori", "prezzo_copertina", 
                      "copie_disponibili", "da_comprare_nuovo", "scuole", "classi"]
    
    missing_fields = []
    for field in required_fields:
        if field not in book:
            missing_fields.append(field)
    
    if missing_fields:
        return False, f"Missing fields: {', '.join(missing_fields)}"
    
    # Verify scuole is an array with nome and codice
    if not isinstance(book["scuole"], list):
        return False, "scuole is not an array"
    
    if len(book["scuole"]) > 0:
        first_school = book["scuole"][0]
        if "nome" not in first_school or "codice" not in first_school:
            return False, "scuole items missing 'nome' or 'codice' fields"
    
    # Verify classi is an array
    if not isinstance(book["classi"], list):
        return False, "classi is not an array"
    
    return True, "All required fields present"

def test_book_search(search_query, limit=5):
    """Test book search endpoint"""
    print(f"\n{'='*80}")
    print(f"Testing search query: '{search_query}' (limit={limit})")
    print(f"{'='*80}")
    
    response = requests.get(f"{BASE_URL}/books/search", params={
        "q": search_query,
        "limit": limit
    })
    
    # Test 1: Check response status
    test_name = f"Search '{search_query}' - Response Status 200"
    passed = log_test(test_name, response.status_code == 200, 
                     f"Status code: {response.status_code}")
    
    if not passed:
        print(f"Response body: {response.text[:500]}")
        return False
    
    # Parse response
    try:
        data = response.json()
    except json.JSONDecodeError as e:
        log_test(f"Search '{search_query}' - Valid JSON Response", False, 
                f"JSON decode error: {str(e)}")
        return False
    
    # Test 2: Check response structure
    test_name = f"Search '{search_query}' - Response has 'books' array"
    has_books = "books" in data and isinstance(data["books"], list)
    log_test(test_name, has_books, 
            f"Response keys: {list(data.keys())}")
    
    if not has_books:
        return False
    
    books = data["books"]
    
    # Test 3: Check if books were found
    test_name = f"Search '{search_query}' - Found books"
    found_books = len(books) > 0
    log_test(test_name, found_books, 
            f"Found {len(books)} books")
    
    if not found_books:
        print(f"⚠️  No books found for search query '{search_query}'")
        return True  # Not a failure, just no results
    
    # Test 4: Verify first book structure
    first_book = books[0]
    test_name = f"Search '{search_query}' - First book has all required fields"
    is_valid, details = verify_book_structure(first_book, search_query)
    log_test(test_name, is_valid, details)
    
    # Test 5: Verify scuole array has school names
    test_name = f"Search '{search_query}' - Scuole array contains school names"
    has_schools = len(first_book.get("scuole", [])) > 0
    if has_schools:
        school_names = [s.get("nome", "") for s in first_book["scuole"]]
        log_test(test_name, True, 
                f"Found {len(school_names)} schools: {', '.join(school_names[:3])}")
    else:
        log_test(test_name, False, "No schools found in scuole array")
    
    # Test 6: Verify classi array has class identifiers
    test_name = f"Search '{search_query}' - Classi array contains class identifiers"
    has_classes = len(first_book.get("classi", [])) > 0
    if has_classes:
        class_names = first_book["classi"]
        log_test(test_name, True, 
                f"Found {len(class_names)} classes: {', '.join(class_names[:5])}")
    else:
        log_test(test_name, False, "No classes found in classi array")
    
    # Print sample book details
    print(f"\n📚 Sample Book Details:")
    print(f"   ISBN: {first_book.get('isbn', 'N/A')}")
    print(f"   Titolo: {first_book.get('titolo', 'N/A')}")
    print(f"   Autori: {first_book.get('autori', 'N/A')}")
    print(f"   Prezzo Copertina: €{first_book.get('prezzo_copertina', 0)}")
    print(f"   Copie Disponibili: {first_book.get('copie_disponibili', 0)}")
    print(f"   Da Comprare Nuovo: {first_book.get('da_comprare_nuovo', False)}")
    print(f"   Scuole: {len(first_book.get('scuole', []))} schools")
    print(f"   Classi: {', '.join(first_book.get('classi', [])[:5])}")
    
    return True

def main():
    print("\n" + "="*80)
    print("RIBOOK BACKEND TESTING - BOOK SEARCH API")
    print("="*80)
    print(f"Backend URL: {BASE_URL}")
    print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    # Test Case 1: Search "matematica"
    test_book_search("matematica", limit=5)
    
    # Test Case 2: Search "storia"
    test_book_search("storia", limit=5)
    
    # Test Case 3: Search "inglese"
    test_book_search("inglese", limit=5)
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total Tests: {test_count}")
    print(f"✅ Passed: {passed_count}")
    print(f"❌ Failed: {failed_count}")
    print(f"Success Rate: {(passed_count/test_count*100):.1f}%")
    print("="*80)
    
    # Print detailed results
    if failed_count > 0:
        print("\n❌ FAILED TESTS:")
        for result in test_results:
            if not result["passed"]:
                print(f"  - {result['test']}")
                if result["details"]:
                    print(f"    {result['details']}")
    
    return failed_count == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
