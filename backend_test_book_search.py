#!/usr/bin/env python3
"""
RiBook Backend Testing - Book Search Functionality
Tests the book search endpoint for Catanzaro schools:
- GET /api/books/search?q={query}&limit={limit}
- Verifies response format and data
- Tests case-insensitive search
- Tests partial word matching
- Verifies da_comprare_nuovo logic
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

print("=" * 80)
print("RiBook Backend Testing - Book Search Functionality")
print("Testing endpoint: GET /api/books/search")
print("=" * 80)
print()

# Test 1: Search for "matematica" with limit 10
print("Test 1: Search for 'matematica' with limit 10...")
response = requests.get(f"{BASE_URL}/books/search", params={"q": "matematica", "limit": 10})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    total = data.get("total", 0)
    
    log_test("GET /api/books/search?q=matematica&limit=10", True, 
             f"Status 200, Found {total} books")
    
    # Verify response structure
    has_books_key = "books" in data
    has_total_key = "total" in data
    log_test("Response has 'books' and 'total' keys", 
             has_books_key and has_total_key,
             f"books: {has_books_key}, total: {has_total_key}")
    
    # Verify at least one book returned
    log_test("At least one book returned", len(books) > 0, 
             f"Found {len(books)} books")
    
    if len(books) > 0:
        # Verify first book has required fields
        first_book = books[0]
        required_fields = ["isbn", "titolo", "autori", "prezzo_copertina", 
                          "copie_disponibili", "da_comprare_nuovo"]
        
        missing_fields = [field for field in required_fields if field not in first_book]
        log_test("First book has all required fields", 
                len(missing_fields) == 0,
                f"Missing fields: {missing_fields}" if missing_fields else "All fields present")
        
        # Print sample book for verification
        print(f"\n    Sample book:")
        print(f"      ISBN: {first_book.get('isbn')}")
        print(f"      Titolo: {first_book.get('titolo')}")
        print(f"      Autori: {first_book.get('autori')}")
        print(f"      Editore: {first_book.get('editore')}")
        print(f"      Prezzo copertina: €{first_book.get('prezzo_copertina')}")
        print(f"      Copie disponibili: {first_book.get('copie_disponibili')}")
        print(f"      Prezzo minimo: {first_book.get('prezzo_minimo')}")
        print(f"      Da comprare nuovo: {first_book.get('da_comprare_nuovo')}")
        
        # Verify da_comprare_nuovo logic
        copie_disponibili = first_book.get('copie_disponibili', 0)
        da_comprare_nuovo = first_book.get('da_comprare_nuovo', False)
        correct_logic = (copie_disponibili == 0 and da_comprare_nuovo) or \
                       (copie_disponibili > 0 and not da_comprare_nuovo)
        log_test("da_comprare_nuovo logic is correct", 
                correct_logic,
                f"copie_disponibili={copie_disponibili}, da_comprare_nuovo={da_comprare_nuovo}")
        
        # Verify title contains search term (case-insensitive)
        title_lower = first_book.get('titolo', '').lower()
        contains_search = 'matemat' in title_lower
        log_test("Book title contains search term 'matemat'", 
                contains_search,
                f"Title: {first_book.get('titolo')}")
else:
    log_test("GET /api/books/search?q=matematica&limit=10", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Test 2: Search for "storia"
print("\nTest 2: Search for 'storia'...")
response = requests.get(f"{BASE_URL}/books/search", params={"q": "storia", "limit": 10})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    total = data.get("total", 0)
    
    log_test("GET /api/books/search?q=storia", True, 
             f"Status 200, Found {total} books")
    
    if len(books) > 0:
        first_book = books[0]
        title_lower = first_book.get('titolo', '').lower()
        contains_search = 'storia' in title_lower or 'stori' in title_lower
        log_test("Book title contains 'storia'", 
                contains_search,
                f"Title: {first_book.get('titolo')}")
else:
    log_test("GET /api/books/search?q=storia", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Test 3: Search for "inglese"
print("\nTest 3: Search for 'inglese'...")
response = requests.get(f"{BASE_URL}/books/search", params={"q": "inglese", "limit": 10})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    total = data.get("total", 0)
    
    log_test("GET /api/books/search?q=inglese", True, 
             f"Status 200, Found {total} books")
    
    if len(books) > 0:
        first_book = books[0]
        title_lower = first_book.get('titolo', '').lower()
        contains_search = 'inglese' in title_lower or 'english' in title_lower or 'ingl' in title_lower
        log_test("Book title contains 'inglese' or related term", 
                contains_search,
                f"Title: {first_book.get('titolo')}")
else:
    log_test("GET /api/books/search?q=inglese", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Test 4: Search for "latino"
print("\nTest 4: Search for 'latino'...")
response = requests.get(f"{BASE_URL}/books/search", params={"q": "latino", "limit": 10})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    total = data.get("total", 0)
    
    log_test("GET /api/books/search?q=latino", True, 
             f"Status 200, Found {total} books")
    
    if len(books) > 0:
        first_book = books[0]
        title_lower = first_book.get('titolo', '').lower()
        contains_search = 'latin' in title_lower
        log_test("Book title contains 'latin'", 
                contains_search,
                f"Title: {first_book.get('titolo')}")
    else:
        log_test("No books found for 'latino'", True, 
                "This is acceptable if no Latin books exist in Catanzaro schools")
else:
    log_test("GET /api/books/search?q=latino", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Test 5: Case-insensitive search (MATEMATICA vs matematica)
print("\nTest 5: Case-insensitive search (MATEMATICA)...")
response_upper = requests.get(f"{BASE_URL}/books/search", params={"q": "MATEMATICA", "limit": 10})
response_lower = requests.get(f"{BASE_URL}/books/search", params={"q": "matematica", "limit": 10})

if response_upper.status_code == 200 and response_lower.status_code == 200:
    data_upper = response_upper.json()
    data_lower = response_lower.json()
    
    books_upper = data_upper.get("books", [])
    books_lower = data_lower.get("books", [])
    
    # Compare ISBNs to verify same results
    isbns_upper = [b.get('isbn') for b in books_upper]
    isbns_lower = [b.get('isbn') for b in books_lower]
    
    same_results = set(isbns_upper) == set(isbns_lower)
    log_test("Case-insensitive search returns same results", 
            same_results,
            f"MATEMATICA: {len(books_upper)} books, matematica: {len(books_lower)} books")
else:
    log_test("Case-insensitive search", False, 
             "Failed to get responses for both queries")

# Test 6: Partial word search (mat should find matematica)
print("\nTest 6: Partial word search ('mat' should find 'matematica')...")
response = requests.get(f"{BASE_URL}/books/search", params={"q": "mat", "limit": 10})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    
    log_test("GET /api/books/search?q=mat", True, 
             f"Status 200, Found {len(books)} books")
    
    if len(books) > 0:
        # Check if any book contains "mat" in title
        found_match = False
        for book in books:
            title_lower = book.get('titolo', '').lower()
            if 'mat' in title_lower:
                found_match = True
                print(f"    Found: {book.get('titolo')}")
                break
        
        log_test("Partial search 'mat' finds books with 'mat' in title", 
                found_match,
                "Found matching books")
else:
    log_test("GET /api/books/search?q=mat", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Test 7: Verify books are from adozioni collection (Catanzaro schools)
print("\nTest 7: Verify books are from Catanzaro schools (adozioni collection)...")
response = requests.get(f"{BASE_URL}/books/search", params={"q": "matematica", "limit": 5})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    
    if len(books) > 0:
        # Check if books have school-related fields (classe, disciplina)
        first_book = books[0]
        has_classe = "classe" in first_book
        has_disciplina = "disciplina" in first_book
        
        log_test("Books have school-related fields (classe, disciplina)", 
                has_classe or has_disciplina,
                f"classe: {has_classe}, disciplina: {has_disciplina}")
        
        if has_classe:
            print(f"    Classe: {first_book.get('classe')}")
        if has_disciplina:
            print(f"    Disciplina: {first_book.get('disciplina')}")
else:
    log_test("Verify books from adozioni collection", False, 
             f"HTTP {response.status_code}")

# Test 8: Verify da_comprare_nuovo logic for multiple books
print("\nTest 8: Verify da_comprare_nuovo logic for multiple books...")
response = requests.get(f"{BASE_URL}/books/search", params={"q": "matematica", "limit": 10})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    
    logic_errors = []
    for i, book in enumerate(books):
        copie = book.get('copie_disponibili', 0)
        da_comprare = book.get('da_comprare_nuovo', False)
        
        # Logic: copie_disponibili == 0 => da_comprare_nuovo == True
        #        copie_disponibili > 0 => da_comprare_nuovo == False
        if copie == 0 and not da_comprare:
            logic_errors.append(f"Book {i+1}: copie=0 but da_comprare_nuovo=False")
        elif copie > 0 and da_comprare:
            logic_errors.append(f"Book {i+1}: copie={copie} but da_comprare_nuovo=True")
    
    log_test("da_comprare_nuovo logic correct for all books", 
            len(logic_errors) == 0,
            f"Errors: {logic_errors}" if logic_errors else "All books have correct logic")
else:
    log_test("Verify da_comprare_nuovo logic", False, 
             f"HTTP {response.status_code}")

# Test 9: Verify prezzo_minimo is set when copie_disponibili > 0
print("\nTest 9: Verify prezzo_minimo is set when copie_disponibili > 0...")
response = requests.get(f"{BASE_URL}/books/search", params={"q": "matematica", "limit": 10})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    
    books_with_copies = [b for b in books if b.get('copie_disponibili', 0) > 0]
    
    if len(books_with_copies) > 0:
        pricing_errors = []
        for book in books_with_copies:
            copie = book.get('copie_disponibili', 0)
            prezzo_minimo = book.get('prezzo_minimo')
            
            if prezzo_minimo is None:
                pricing_errors.append(f"{book.get('titolo')}: copie={copie} but prezzo_minimo=None")
        
        log_test("prezzo_minimo is set when copie_disponibili > 0", 
                len(pricing_errors) == 0,
                f"Errors: {pricing_errors}" if pricing_errors else f"All {len(books_with_copies)} books with copies have prezzo_minimo")
    else:
        log_test("prezzo_minimo check", True, 
                "No books with available copies to test (acceptable)")
else:
    log_test("Verify prezzo_minimo logic", False, 
             f"HTTP {response.status_code}")

# Test 10: Verify limit parameter works
print("\nTest 10: Verify limit parameter works...")
response_5 = requests.get(f"{BASE_URL}/books/search", params={"q": "matematica", "limit": 5})
response_10 = requests.get(f"{BASE_URL}/books/search", params={"q": "matematica", "limit": 10})

if response_5.status_code == 200 and response_10.status_code == 200:
    data_5 = response_5.json()
    data_10 = response_10.json()
    
    books_5 = data_5.get("books", [])
    books_10 = data_10.get("books", [])
    
    limit_5_works = len(books_5) <= 5
    limit_10_works = len(books_10) <= 10
    
    log_test("Limit parameter works correctly", 
            limit_5_works and limit_10_works,
            f"limit=5: {len(books_5)} books, limit=10: {len(books_10)} books")
else:
    log_test("Verify limit parameter", False, 
             "Failed to get responses")

# Summary
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"Total Tests: {test_count}")
print(f"Passed: {passed_count} ✅")
print(f"Failed: {failed_count} ❌")
print(f"Success Rate: {(passed_count/test_count*100):.1f}%")
print("=" * 80)

if failed_count == 0:
    print("\n🎉 ALL TESTS PASSED! Book search functionality is working correctly.")
else:
    print(f"\n⚠️  {failed_count} test(s) failed. Please review the details above.")

print("\nFeatures Tested:")
print("  ✓ Basic search functionality")
print("  ✓ Response format and required fields")
print("  ✓ Multiple search terms (matematica, storia, inglese, latino)")
print("  ✓ Case-insensitive search")
print("  ✓ Partial word matching")
print("  ✓ da_comprare_nuovo logic")
print("  ✓ prezzo_minimo logic")
print("  ✓ Limit parameter")
print("  ✓ Books from adozioni collection (Catanzaro schools)")
print("=" * 80)

# Exit with appropriate code
exit(0 if failed_count == 0 else 1)
