#!/usr/bin/env python3
"""
Backend Test for IDOR Vulnerability Fix
Tests authentication requirements on user-specific endpoints
"""

import requests
import json
from typing import Dict, Any

# Backend URL
BASE_URL = "https://language-check-10.preview.emergentagent.com/api"

# Test user IDs (arbitrary for IDOR testing)
TEST_USER_ID = "test-user-123"
ANOTHER_USER_ID = "another-user-456"

# Colors for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_test(test_name: str):
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST: {test_name}{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")

def print_success(message: str):
    print(f"{GREEN}✓ {message}{RESET}")

def print_error(message: str):
    print(f"{RED}✗ {message}{RESET}")

def print_info(message: str):
    print(f"{YELLOW}ℹ {message}{RESET}")

def test_endpoint_without_token(endpoint: str, expected_status: int = 401, expected_message: str = None) -> bool:
    """Test endpoint without authentication token"""
    url = f"{BASE_URL}{endpoint}"
    print_info(f"Testing: GET {url}")
    
    try:
        response = requests.get(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == expected_status:
            try:
                data = response.json()
                print_info(f"Response: {json.dumps(data, indent=2)}")
                
                if expected_message:
                    detail = data.get("detail", "")
                    if expected_message.lower() in detail.lower():
                        print_success(f"Correct error message: '{detail}'")
                        return True
                    else:
                        print_error(f"Expected message containing '{expected_message}', got: '{detail}'")
                        return False
                else:
                    return True
            except json.JSONDecodeError:
                print_info(f"Response text: {response.text}")
                return True
        else:
            print_error(f"Expected status {expected_status}, got {response.status_code}")
            try:
                print_info(f"Response: {response.json()}")
            except:
                print_info(f"Response text: {response.text}")
            return False
            
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False

def test_endpoint_with_invalid_token(endpoint: str, expected_status: int = 401, expected_message: str = None) -> bool:
    """Test endpoint with invalid authentication token"""
    url = f"{BASE_URL}{endpoint}"
    headers = {"Authorization": "Bearer fake-invalid-token-12345"}
    print_info(f"Testing: GET {url}")
    print_info(f"Headers: {headers}")
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == expected_status:
            try:
                data = response.json()
                print_info(f"Response: {json.dumps(data, indent=2)}")
                
                if expected_message:
                    detail = data.get("detail", "")
                    if expected_message.lower() in detail.lower():
                        print_success(f"Correct error message: '{detail}'")
                        return True
                    else:
                        print_error(f"Expected message containing '{expected_message}', got: '{detail}'")
                        return False
                else:
                    return True
            except json.JSONDecodeError:
                print_info(f"Response text: {response.text}")
                return True
        else:
            print_error(f"Expected status {expected_status}, got {response.status_code}")
            try:
                print_info(f"Response: {response.json()}")
            except:
                print_info(f"Response text: {response.text}")
            return False
            
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False

def test_public_endpoint(endpoint: str, expected_status: int = 200) -> bool:
    """Test public endpoint that should work without authentication"""
    url = f"{BASE_URL}{endpoint}"
    print_info(f"Testing: GET {url}")
    
    try:
        response = requests.get(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == expected_status:
            try:
                data = response.json()
                print_success(f"Public endpoint accessible without auth")
                print_info(f"Response type: {type(data)}")
                if isinstance(data, list):
                    print_info(f"Response contains {len(data)} items")
                elif isinstance(data, dict):
                    print_info(f"Response keys: {list(data.keys())}")
                return True
            except json.JSONDecodeError:
                print_info(f"Response text: {response.text[:200]}")
                return True
        else:
            print_error(f"Expected status {expected_status}, got {response.status_code}")
            try:
                print_info(f"Response: {response.json()}")
            except:
                print_info(f"Response text: {response.text[:200]}")
            return False
            
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False

def main():
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}IDOR VULNERABILITY FIX - BACKEND TESTING{RESET}")
    print(f"{BLUE}Testing authentication requirements on user-specific endpoints{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    results = {
        "passed": 0,
        "failed": 0,
        "total": 0
    }
    
    # Test 1: /api/notifications/{user_id} without token
    print_test("Test 1: GET /api/notifications/{user_id} WITHOUT token")
    if test_endpoint_without_token(
        f"/notifications/{TEST_USER_ID}",
        expected_status=401,
        expected_message="Autenticazione richiesta"
    ):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Test 2: /api/cart/{user_id} without token
    print_test("Test 2: GET /api/cart/{user_id} WITHOUT token")
    if test_endpoint_without_token(
        f"/cart/{TEST_USER_ID}",
        expected_status=401,
        expected_message="Autenticazione richiesta"
    ):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Test 3: /api/user-orders/{user_id} without token
    print_test("Test 3: GET /api/user-orders/{user_id} WITHOUT token")
    if test_endpoint_without_token(
        f"/user-orders/{TEST_USER_ID}",
        expected_status=401,
        expected_message="Autenticazione richiesta"
    ):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Test 4: /api/conversations/{user_id} without token
    print_test("Test 4: GET /api/conversations/{user_id} WITHOUT token")
    if test_endpoint_without_token(
        f"/conversations/{TEST_USER_ID}",
        expected_status=401,
        expected_message="Autenticazione richiesta"
    ):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Test 5: /api/notifications/{user_id} with invalid token
    print_test("Test 5: GET /api/notifications/{user_id} WITH INVALID token")
    if test_endpoint_with_invalid_token(
        f"/notifications/{TEST_USER_ID}",
        expected_status=401,
        expected_message="Sessione non valida"
    ):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Test 6: /api/cart/{user_id} with invalid token
    print_test("Test 6: GET /api/cart/{user_id} WITH INVALID token")
    if test_endpoint_with_invalid_token(
        f"/cart/{TEST_USER_ID}",
        expected_status=401,
        expected_message="Sessione non valida"
    ):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Test 7: /api/user-orders/{user_id} with invalid token
    print_test("Test 7: GET /api/user-orders/{user_id} WITH INVALID token")
    if test_endpoint_with_invalid_token(
        f"/user-orders/{TEST_USER_ID}",
        expected_status=401,
        expected_message="Sessione non valida"
    ):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Test 8: /api/conversations/{user_id} with invalid token
    print_test("Test 8: GET /api/conversations/{user_id} WITH INVALID token")
    if test_endpoint_with_invalid_token(
        f"/conversations/{TEST_USER_ID}",
        expected_status=401,
        expected_message="Sessione non valida"
    ):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Test 9: Public endpoint /api/listings (should work without auth)
    print_test("Test 9: GET /api/listings (PUBLIC endpoint)")
    if test_public_endpoint("/listings", expected_status=200):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Test 10: Public endpoint /api/bookstores (should work without auth)
    print_test("Test 10: GET /api/bookstores (PUBLIC endpoint)")
    if test_public_endpoint("/bookstores", expected_status=200):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1
    
    # Print summary
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    print(f"Total Tests: {results['total']}")
    print(f"{GREEN}Passed: {results['passed']}{RESET}")
    print(f"{RED}Failed: {results['failed']}{RESET}")
    
    if results['failed'] == 0:
        print(f"\n{GREEN}{'='*80}{RESET}")
        print(f"{GREEN}✓ ALL TESTS PASSED - IDOR VULNERABILITY FIX WORKING CORRECTLY{RESET}")
        print(f"{GREEN}{'='*80}{RESET}")
        return 0
    else:
        print(f"\n{RED}{'='*80}{RESET}")
        print(f"{RED}✗ SOME TESTS FAILED - REVIEW REQUIRED{RESET}")
        print(f"{RED}{'='*80}{RESET}")
        return 1

if __name__ == "__main__":
    exit(main())
