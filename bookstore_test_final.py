#!/usr/bin/env python3
"""
Backend API Testing for RiLiBro Bookstore Registration and Portal
Tests the new bookstore registration and portal endpoints as specified in the review request.
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://language-check-10.preview.emergentagent.com/api"
ADMIN_USER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"  # This user should be made admin
EXISTING_BOOKSTORE_ID = "21d774b1-2fbe-4b21-ae5b-94d158df2f72"  # From review request

def log_test(test_name, success, details):
    """Log test results"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}: {details}")

def test_bookstore_registration_request():
    """Test 1: Submit a bookstore registration request"""
    print("\n=== Test 1: Submit Bookstore Registration Request ===")
    
    payload = {
        "nome_attivita": "Cartolibreria Test Final",
        "email": "testfinal@cartolibreria.it",
        "partita_iva": "12345678903",
        "indirizzo": "Via Test Final, 1",
        "citta": "Catanzaro",
        "telefono": "0961999997"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/bookstore/registration-request", json=payload, timeout=30)
        if response.status_code == 200:
            data = response.json()
            request_id = data.get("request_id")
            success = data.get("success")
            if request_id and success:
                log_test("Bookstore Registration Request", True, f"Registration request submitted successfully with ID: {request_id}")
                return request_id
            else:
                log_test("Bookstore Registration Request", False, f"Missing request_id or success flag: {data}")
                return None
        else:
            log_test("Bookstore Registration Request", False, f"HTTP {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Bookstore Registration Request", False, f"Request failed: {e}")
        return None

def test_get_bookstore_requests_admin():
    """Test 2: Get bookstore requests (admin endpoint)"""
    print("\n=== Test 2: Get Bookstore Requests (Admin) ===")
    
    try:
        response = requests.get(f"{BASE_URL}/admin/bookstore-requests?admin_id={ADMIN_USER_ID}", timeout=30)
        if response.status_code == 200:
            data = response.json()
            requests_list = data.get("requests", [])
            log_test("Get Bookstore Requests (Admin)", True, f"Retrieved {len(requests_list)} bookstore requests")
            return True
        elif response.status_code == 403:
            log_test("Get Bookstore Requests (Admin)", False, f"User is not admin - expected behavior: {response.text}")
            return False
        else:
            log_test("Get Bookstore Requests (Admin)", False, f"HTTP {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Get Bookstore Requests (Admin)", False, f"Request failed: {e}")
        return False

def test_bookstore_login_without_password():
    """Test 3: Test bookstore login with existing bookstore (should fail without password)"""
    print("\n=== Test 3: Bookstore Login Without Password ===")
    
    try:
        response = requests.post(f"{BASE_URL}/bookstore/login?email=test@cartolibreria.it&password=testpassword", timeout=30)
        if response.status_code == 401:
            log_test("Bookstore Login Without Password", True, "Login failed as expected (401 error) - no password set yet")
            return True
        elif response.status_code == 200:
            log_test("Bookstore Login Without Password", False, f"Login unexpectedly succeeded: {response.text}")
            return False
        else:
            log_test("Bookstore Login Without Password", False, f"HTTP {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Bookstore Login Without Password", False, f"Request failed: {e}")
        return False

def test_order_with_order_code():
    """Test 4: Create an order and verify it has an order_code field"""
    print("\n=== Test 4: Test Order with Order Code ===")
    
    try:
        # First get available listings
        listings_response = requests.get(f"{BASE_URL}/listings", timeout=30)
        if listings_response.status_code != 200:
            log_test("Order with Order Code", False, "Cannot get listings")
            return False
        
        listings = listings_response.json()
        if not listings:
            log_test("Order with Order Code", False, "No listings available")
            return False
        
        # Find a suitable listing (not from the test user and with status available)
        suitable_listing = None
        for listing in listings:
            if (listing.get("seller_id") != ADMIN_USER_ID and 
                (listing.get("status") == "available" or listing.get("stato") == "disponibile")):
                suitable_listing = listing
                break
        
        if not suitable_listing:
            # Check if there are any available listings at all
            available_listings = [l for l in listings if l.get("status") == "available" or l.get("stato") == "disponibile"]
            if not available_listings:
                log_test("Order with Order Code", False, "No available listings found in the system")
                return False
            else:
                log_test("Order with Order Code", False, "All available listings belong to test user - cannot test order creation (users can't buy their own books)")
                return False
        
        # Get bookstores
        bookstores_response = requests.get(f"{BASE_URL}/bookstores", timeout=30)
        if bookstores_response.status_code != 200:
            log_test("Order with Order Code", False, "Cannot get bookstores")
            return False
        
        bookstores = bookstores_response.json()
        if not bookstores:
            log_test("Order with Order Code", False, "No bookstores available")
            return False
        
        # Create order
        order_payload = {
            "listing_id": suitable_listing["id"],
            "bookstore_id": bookstores[0]["id"]
        }
        
        order_response = requests.post(f"{BASE_URL}/orders/create?user_id={ADMIN_USER_ID}", json=order_payload, timeout=30)
        if order_response.status_code == 200:
            order_data = order_response.json()
            order_id = order_data.get("order_id")
            
            if not order_id:
                log_test("Order with Order Code", False, f"No order_id in response: {order_data}")
                return False
            
            # Get order details to check for order_code
            order_details_response = requests.get(f"{BASE_URL}/orders/{order_id}?user_id={ADMIN_USER_ID}", timeout=30)
            if order_details_response.status_code != 200:
                log_test("Order with Order Code", False, "Cannot get order details")
                return False
            
            order_details = order_details_response.json()
            order_code = order_details.get("order_code")
            
            if order_code and len(order_code) == 6 and order_code.isalnum():
                log_test("Order with Order Code", True, f"Order created with 6-character alphanumeric order_code: {order_code}")
                return True
            else:
                log_test("Order with Order Code", False, f"Invalid or missing order_code: {order_code}")
                return False
        else:
            log_test("Order with Order Code", False, f"Order creation failed - HTTP {order_response.status_code}: {order_response.text}")
            return False
    except Exception as e:
        log_test("Order with Order Code", False, f"Request failed: {e}")
        return False

def test_bookstore_orders_endpoint():
    """Test 5: Test bookstore orders endpoint for existing bookstores"""
    print("\n=== Test 5: Bookstore Orders Endpoint ===")
    
    try:
        response = requests.get(f"{BASE_URL}/bookstore/{EXISTING_BOOKSTORE_ID}/orders", timeout=30)
        if response.status_code == 200:
            data = response.json()
            bookstore_name = data.get("bookstore_name")
            orders = data.get("orders", [])
            total = data.get("total", 0)
            
            if bookstore_name is not None:  # Can be empty string
                log_test("Bookstore Orders Endpoint", True, f"Retrieved orders for bookstore '{bookstore_name}': {total} orders")
                return True
            else:
                log_test("Bookstore Orders Endpoint", False, f"Missing bookstore_name in response: {data}")
                return False
        elif response.status_code == 404:
            log_test("Bookstore Orders Endpoint", False, f"Bookstore not found: {response.text}")
            return False
        else:
            log_test("Bookstore Orders Endpoint", False, f"HTTP {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Bookstore Orders Endpoint", False, f"Request failed: {e}")
        return False

def run_all_tests():
    """Run all tests"""
    print("🚀 Starting Bookstore Registration and Portal Test Suite")
    print(f"Base URL: {BASE_URL}")
    print(f"Admin User ID: {ADMIN_USER_ID}")
    print(f"Existing Bookstore ID: {EXISTING_BOOKSTORE_ID}")
    
    results = []
    
    # Test 1: Submit bookstore registration request
    results.append(test_bookstore_registration_request() is not None)
    
    # Test 2: Get bookstore requests (admin)
    results.append(test_get_bookstore_requests_admin())
    
    # Test 3: Test bookstore login without password
    results.append(test_bookstore_login_without_password())
    
    # Test 4: Test order with order_code
    results.append(test_order_with_order_code())
    
    # Test 5: Test bookstore orders endpoint
    results.append(test_bookstore_orders_endpoint())
    
    # Summary
    total_tests = len(results)
    passed_tests = sum(results)
    failed_tests = total_tests - passed_tests
    
    print("\n" + "="*60)
    print("📊 BOOKSTORE REGISTRATION & PORTAL TEST SUMMARY")
    print("="*60)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {failed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%" if total_tests > 0 else "0%")
    
    return {
        "total": total_tests,
        "passed": passed_tests,
        "failed": failed_tests,
        "success_rate": (passed_tests/total_tests*100) if total_tests > 0 else 0
    }

if __name__ == "__main__":
    summary = run_all_tests()
    
    # Save results to file
    with open("/app/bookstore_test_results_final.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n📁 Results saved to: /app/bookstore_test_results_final.json")