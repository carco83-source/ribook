#!/usr/bin/env python3
"""
RiBook Backend Testing - Search Badge Logic
Tests the /api/books/search endpoint to verify correct badge logic:
- "DA ACQUISTARE NUOVO" (must buy new): When nuova_adozione=True OR da_acquistare=True
- "REPERIBILE USATO" (available used): When nuova_adozione=False AND da_acquistare=False

Test Cases:
1. Search with query "matematica" - verify badge logic
2. Search with query "inglese" - verify badge logic
3. Verify data consistency rules
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

def verify_badge_logic(book, book_index):
    """
    Verify badge logic for a single book:
    - solo_nuovo = nuova_adozione OR da_acquistare
    - is_reperibile_usato = NOT solo_nuovo
    """
    isbn = book.get("isbn", "N/A")
    titolo = book.get("titolo", "N/A")
    nuova_adozione = book.get("nuova_adozione", False)
    da_acquistare = book.get("da_acquistare", False)
    solo_nuovo = book.get("solo_nuovo", False)
    is_reperibile_usato = book.get("is_reperibile_usato", False)
    
    # Calculate expected values
    expected_solo_nuovo = nuova_adozione or da_acquistare
    expected_is_reperibile_usato = not expected_solo_nuovo
    
    # Verify logic
    logic_correct = (solo_nuovo == expected_solo_nuovo) and (is_reperibile_usato == expected_is_reperibile_usato)
    
    details = f"Book {book_index}: {titolo[:50]} (ISBN: {isbn})\n"
    details += f"        nuova_adozione={nuova_adozione}, da_acquistare={da_acquistare}\n"
    details += f"        solo_nuovo={solo_nuovo} (expected: {expected_solo_nuovo})\n"
    details += f"        is_reperibile_usato={is_reperibile_usato} (expected: {expected_is_reperibile_usato})"
    
    return logic_correct, details

def verify_data_consistency(book, book_index):
    """
    Verify data consistency rules:
    - If nuova_adozione=True, then solo_nuovo MUST be True
    - If da_acquistare=True, then solo_nuovo MUST be True
    - If solo_nuovo=True, then is_reperibile_usato MUST be False
    - If solo_nuovo=False, then is_reperibile_usato MUST be True
    """
    isbn = book.get("isbn", "N/A")
    titolo = book.get("titolo", "N/A")
    nuova_adozione = book.get("nuova_adozione", False)
    da_acquistare = book.get("da_acquistare", False)
    solo_nuovo = book.get("solo_nuovo", False)
    is_reperibile_usato = book.get("is_reperibile_usato", False)
    
    errors = []
    
    # Rule 1: If nuova_adozione=True, then solo_nuovo MUST be True
    if nuova_adozione and not solo_nuovo:
        errors.append("nuova_adozione=True but solo_nuovo=False")
    
    # Rule 2: If da_acquistare=True, then solo_nuovo MUST be True
    if da_acquistare and not solo_nuovo:
        errors.append("da_acquistare=True but solo_nuovo=False")
    
    # Rule 3: If solo_nuovo=True, then is_reperibile_usato MUST be False
    if solo_nuovo and is_reperibile_usato:
        errors.append("solo_nuovo=True but is_reperibile_usato=True")
    
    # Rule 4: If solo_nuovo=False, then is_reperibile_usato MUST be True
    if not solo_nuovo and not is_reperibile_usato:
        errors.append("solo_nuovo=False but is_reperibile_usato=False")
    
    is_consistent = len(errors) == 0
    
    details = f"Book {book_index}: {titolo[:50]} (ISBN: {isbn})"
    if not is_consistent:
        details += f"\n        Errors: {', '.join(errors)}"
    
    return is_consistent, details

print("=" * 80)
print("RiBook Backend Testing - Search Badge Logic")
print("Testing endpoint: GET /api/books/search")
print("=" * 80)
print()

# Test Case 1: Search with query "matematica"
print("Test Case 1: Search with query 'matematica'")
print("-" * 80)
response = requests.get(f"{BASE_URL}/books/search", params={"q": "matematica", "limit": 10})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    total = data.get("total", 0)
    
    log_test("GET /api/books/search?q=matematica", True, 
             f"Found {total} books")
    
    if total > 0:
        # Verify response structure
        first_book = books[0]
        required_fields = ["isbn", "titolo", "nuova_adozione", "da_acquistare", "solo_nuovo", "is_reperibile_usato", "copie_disponibili", "scuole"]
        missing_fields = [field for field in required_fields if field not in first_book]
        
        log_test("Response contains all required fields", len(missing_fields) == 0,
                f"Missing fields: {missing_fields}" if missing_fields else "All fields present")
        
        # Verify badge logic for each book
        print("\n  Verifying badge logic for each book:")
        all_logic_correct = True
        for i, book in enumerate(books, 1):
            logic_correct, details = verify_badge_logic(book, i)
            if not logic_correct:
                all_logic_correct = False
                print(f"    ❌ {details}")
            else:
                print(f"    ✅ Book {i}: Logic correct")
        
        log_test("Badge logic correct for all 'matematica' books", all_logic_correct,
                f"Verified {len(books)} books")
        
        # Verify data consistency
        print("\n  Verifying data consistency:")
        all_consistent = True
        for i, book in enumerate(books, 1):
            is_consistent, details = verify_data_consistency(book, i)
            if not is_consistent:
                all_consistent = False
                print(f"    ❌ {details}")
        
        log_test("Data consistency for all 'matematica' books", all_consistent,
                f"Verified {len(books)} books")
    else:
        log_test("Search returned books", False, "No books found for 'matematica'")
else:
    log_test("GET /api/books/search?q=matematica", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Test Case 2: Search with query "inglese"
print("\n" + "=" * 80)
print("Test Case 2: Search with query 'inglese'")
print("-" * 80)
response = requests.get(f"{BASE_URL}/books/search", params={"q": "inglese", "limit": 10})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    total = data.get("total", 0)
    
    log_test("GET /api/books/search?q=inglese", True, 
             f"Found {total} books")
    
    if total > 0:
        # Verify response structure
        first_book = books[0]
        required_fields = ["isbn", "titolo", "nuova_adozione", "da_acquistare", "solo_nuovo", "is_reperibile_usato", "copie_disponibili", "scuole"]
        missing_fields = [field for field in required_fields if field not in first_book]
        
        log_test("Response contains all required fields", len(missing_fields) == 0,
                f"Missing fields: {missing_fields}" if missing_fields else "All fields present")
        
        # Verify badge logic for each book
        print("\n  Verifying badge logic for each book:")
        all_logic_correct = True
        for i, book in enumerate(books, 1):
            logic_correct, details = verify_badge_logic(book, i)
            if not logic_correct:
                all_logic_correct = False
                print(f"    ❌ {details}")
            else:
                print(f"    ✅ Book {i}: Logic correct")
        
        log_test("Badge logic correct for all 'inglese' books", all_logic_correct,
                f"Verified {len(books)} books")
        
        # Verify data consistency
        print("\n  Verifying data consistency:")
        all_consistent = True
        for i, book in enumerate(books, 1):
            is_consistent, details = verify_data_consistency(book, i)
            if not is_consistent:
                all_consistent = False
                print(f"    ❌ {details}")
        
        log_test("Data consistency for all 'inglese' books", all_consistent,
                f"Verified {len(books)} books")
    else:
        log_test("Search returned books", False, "No books found for 'inglese'")
else:
    log_test("GET /api/books/search?q=inglese", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Test Case 3: Verify specific badge scenarios
print("\n" + "=" * 80)
print("Test Case 3: Verify specific badge scenarios")
print("-" * 80)

# Search for a broader term to get more variety
response = requests.get(f"{BASE_URL}/books/search", params={"q": "storia", "limit": 20})

if response.status_code == 200:
    data = response.json()
    books = data.get("books", [])
    
    # Find examples of each scenario
    scenario_1 = None  # nuova_adozione=True
    scenario_2 = None  # da_acquistare=True (but nuova_adozione=False)
    scenario_3 = None  # Both False (reperibile usato)
    
    for book in books:
        if book.get("nuova_adozione") and not scenario_1:
            scenario_1 = book
        elif book.get("da_acquistare") and not book.get("nuova_adozione") and not scenario_2:
            scenario_2 = book
        elif not book.get("nuova_adozione") and not book.get("da_acquistare") and not scenario_3:
            scenario_3 = book
    
    # Test Scenario 1: nuova_adozione=True → solo_nuovo=True
    if scenario_1:
        is_correct = scenario_1.get("solo_nuovo") == True and scenario_1.get("is_reperibile_usato") == False
        log_test("Scenario: nuova_adozione=True → solo_nuovo=True, is_reperibile_usato=False", 
                is_correct,
                f"Book: {scenario_1.get('titolo', 'N/A')[:50]}")
    else:
        print("    ⚠️  No books found with nuova_adozione=True")
    
    # Test Scenario 2: da_acquistare=True → solo_nuovo=True
    if scenario_2:
        is_correct = scenario_2.get("solo_nuovo") == True and scenario_2.get("is_reperibile_usato") == False
        log_test("Scenario: da_acquistare=True → solo_nuovo=True, is_reperibile_usato=False", 
                is_correct,
                f"Book: {scenario_2.get('titolo', 'N/A')[:50]}")
    else:
        print("    ⚠️  No books found with da_acquistare=True (and nuova_adozione=False)")
    
    # Test Scenario 3: Both False → is_reperibile_usato=True
    if scenario_3:
        is_correct = scenario_3.get("solo_nuovo") == False and scenario_3.get("is_reperibile_usato") == True
        log_test("Scenario: nuova_adozione=False AND da_acquistare=False → solo_nuovo=False, is_reperibile_usato=True", 
                is_correct,
                f"Book: {scenario_3.get('titolo', 'N/A')[:50]}")
    else:
        print("    ⚠️  No books found with both nuova_adozione=False and da_acquistare=False")
else:
    log_test("GET /api/books/search?q=storia", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

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
    print("\n🎉 ALL TESTS PASSED! Search badge logic is working correctly.")
else:
    print(f"\n⚠️  {failed_count} test(s) failed. Please review the details above.")

print("\nBadge Logic Tested:")
print("  ✓ solo_nuovo = nuova_adozione OR da_acquistare")
print("  ✓ is_reperibile_usato = NOT solo_nuovo")
print("  ✓ Data consistency rules verified")
print("=" * 80)

# Exit with appropriate code
exit(0 if failed_count == 0 else 1)
