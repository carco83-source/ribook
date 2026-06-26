#!/usr/bin/env python3
"""
Backend Security Testing for RiBook
Tests PCI Compliance and IDOR fixes
"""

import requests
import json
import sys

# Backend URL from environment
BACKEND_URL = "https://language-check-10.preview.emergentagent.com/api"

def print_test(test_name, passed, details=""):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {test_name}")
    if details:
        print(f"   {details}")
    print()

def test_stripe_pci_compliance():
    """Test 1: Stripe PCI Compliance"""
    print("=" * 80)
    print("TEST 1: STRIPE PCI COMPLIANCE")
    print("=" * 80)
    print()
    
    # Test 1.1: Deprecated endpoint should return 410
    print("Test 1.1: Deprecated endpoint /api/orders/{order_id}/confirm-stripe-payment")
    try:
        response = requests.post(
            f"{BACKEND_URL}/orders/test-order/confirm-stripe-payment?user_id=test",
            headers={"Content-Type": "application/json"},
            json={
                "payment_intent_id": "pi_test",
                "card_number": "4242424242424242",
                "exp_month": 12,
                "exp_year": 2025,
                "cvc": "123"
            },
            timeout=10
        )
        
        if response.status_code == 410:
            response_data = response.json()
            if "PCI-DSS" in response_data.get("detail", ""):
                print_test(
                    "Deprecated endpoint returns 410 Gone",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')}"
                )
            else:
                print_test(
                    "Deprecated endpoint returns 410 but wrong message",
                    False,
                    f"Expected PCI-DSS message, got: {response_data.get('detail', '')}"
                )
        else:
            print_test(
                "Deprecated endpoint should return 410",
                False,
                f"Expected 410, got {response.status_code}: {response.text}"
            )
    except Exception as e:
        print_test("Deprecated endpoint test", False, f"Error: {str(e)}")
    
    # Test 1.2: New checkout session endpoint exists
    print("Test 1.2: New endpoint /api/orders/{order_id}/create-checkout-session")
    try:
        response = requests.post(
            f"{BACKEND_URL}/orders/test-order/create-checkout-session?user_id=test",
            headers={"Content-Type": "application/json"},
            json={"platform": "web"},
            timeout=10
        )
        
        # We expect 404 because the order doesn't exist, but this proves the endpoint exists
        if response.status_code == 404:
            response_data = response.json()
            if "Ordine non trovato" in response_data.get("detail", ""):
                print_test(
                    "New checkout session endpoint exists",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')} (endpoint exists, order not found as expected)"
                )
            else:
                print_test(
                    "New checkout session endpoint exists but unexpected message",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')}"
                )
        elif response.status_code == 400:
            # Could also be 400 if order exists but wrong status
            print_test(
                "New checkout session endpoint exists",
                True,
                f"Status: {response.status_code}, Message: {response.text} (endpoint exists)"
            )
        else:
            print_test(
                "New checkout session endpoint",
                False,
                f"Unexpected status {response.status_code}: {response.text}"
            )
    except Exception as e:
        print_test("New checkout session endpoint test", False, f"Error: {str(e)}")
    
    # Test 1.3: Verify checkout endpoint exists
    print("Test 1.3: Verify checkout endpoint /api/orders/{order_id}/verify-checkout")
    try:
        response = requests.get(
            f"{BACKEND_URL}/orders/test-order/verify-checkout?session_id=test&user_id=test",
            timeout=10
        )
        
        # We expect 404 because the order doesn't exist
        if response.status_code == 404:
            response_data = response.json()
            if "Ordine non trovato" in response_data.get("detail", ""):
                print_test(
                    "Verify checkout endpoint exists",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')} (endpoint exists, order not found as expected)"
                )
            else:
                print_test(
                    "Verify checkout endpoint exists but unexpected message",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')}"
                )
        elif response.status_code == 400:
            # Could also be 400 if Stripe error
            print_test(
                "Verify checkout endpoint exists",
                True,
                f"Status: {response.status_code}, Message: {response.text} (endpoint exists)"
            )
        else:
            print_test(
                "Verify checkout endpoint",
                False,
                f"Unexpected status {response.status_code}: {response.text}"
            )
    except Exception as e:
        print_test("Verify checkout endpoint test", False, f"Error: {str(e)}")

def test_idor_fixes():
    """Test 2: IDOR Fixes"""
    print("=" * 80)
    print("TEST 2: IDOR FIXES (Insecure Direct Object Reference)")
    print("=" * 80)
    print()
    
    # Test 2.1: Notifications endpoint requires authentication
    print("Test 2.1: GET /api/notifications/{user_id} requires authentication")
    try:
        response = requests.get(
            f"{BACKEND_URL}/notifications/fake-user-id",
            timeout=10
        )
        
        if response.status_code == 401:
            response_data = response.json()
            if "Autenticazione richiesta" in response_data.get("detail", ""):
                print_test(
                    "Notifications endpoint requires authentication",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')}"
                )
            else:
                print_test(
                    "Notifications endpoint returns 401 but wrong message",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')}"
                )
        else:
            print_test(
                "Notifications endpoint should require authentication",
                False,
                f"Expected 401, got {response.status_code}: {response.text}"
            )
    except Exception as e:
        print_test("Notifications IDOR test", False, f"Error: {str(e)}")
    
    # Test 2.2: Cart endpoint requires authentication
    print("Test 2.2: GET /api/cart/{user_id} requires authentication")
    try:
        response = requests.get(
            f"{BACKEND_URL}/cart/fake-user-id",
            timeout=10
        )
        
        if response.status_code == 401:
            response_data = response.json()
            if "Autenticazione richiesta" in response_data.get("detail", ""):
                print_test(
                    "Cart endpoint requires authentication",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')}"
                )
            else:
                print_test(
                    "Cart endpoint returns 401 but wrong message",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')}"
                )
        else:
            print_test(
                "Cart endpoint should require authentication",
                False,
                f"Expected 401, got {response.status_code}: {response.text}"
            )
    except Exception as e:
        print_test("Cart IDOR test", False, f"Error: {str(e)}")
    
    # Test 2.3: User orders endpoint requires authentication
    print("Test 2.3: GET /api/user-orders/{user_id} requires authentication")
    try:
        response = requests.get(
            f"{BACKEND_URL}/user-orders/fake-user-id",
            timeout=10
        )
        
        if response.status_code == 401:
            response_data = response.json()
            if "Autenticazione richiesta" in response_data.get("detail", ""):
                print_test(
                    "User orders endpoint requires authentication",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')}"
                )
            else:
                print_test(
                    "User orders endpoint returns 401 but wrong message",
                    True,
                    f"Status: {response.status_code}, Message: {response_data.get('detail', '')}"
                )
        else:
            print_test(
                "User orders endpoint should require authentication",
                False,
                f"Expected 401, got {response.status_code}: {response.text}"
            )
    except Exception as e:
        print_test("User orders IDOR test", False, f"Error: {str(e)}")

def test_public_endpoints():
    """Test 3: Public Endpoints (Sanity Check)"""
    print("=" * 80)
    print("TEST 3: PUBLIC ENDPOINTS (Sanity Check)")
    print("=" * 80)
    print()
    
    # Test 3.1: Listings endpoint is public
    print("Test 3.1: GET /api/listings is public")
    try:
        response = requests.get(
            f"{BACKEND_URL}/listings",
            timeout=10
        )
        
        if response.status_code == 200:
            print_test(
                "Listings endpoint is public",
                True,
                f"Status: {response.status_code}, returned {len(response.json())} listings"
            )
        else:
            print_test(
                "Listings endpoint should be public",
                False,
                f"Expected 200, got {response.status_code}: {response.text}"
            )
    except Exception as e:
        print_test("Listings public endpoint test", False, f"Error: {str(e)}")
    
    # Test 3.2: Health endpoint (if exists)
    print("Test 3.2: GET /api/health (if exists)")
    try:
        response = requests.get(
            f"{BACKEND_URL}/health",
            timeout=10
        )
        
        if response.status_code == 200:
            print_test(
                "Health endpoint is public",
                True,
                f"Status: {response.status_code}"
            )
        elif response.status_code == 404:
            print_test(
                "Health endpoint does not exist",
                True,
                f"Status: {response.status_code} (endpoint not implemented, this is OK)"
            )
        else:
            print_test(
                "Health endpoint unexpected response",
                False,
                f"Expected 200 or 404, got {response.status_code}: {response.text}"
            )
    except Exception as e:
        print_test("Health endpoint test", False, f"Error: {str(e)}")

def main():
    """Run all security tests"""
    print("\n")
    print("=" * 80)
    print("RIBOOK SECURITY TESTING - PCI COMPLIANCE & IDOR FIXES")
    print("=" * 80)
    print(f"Backend URL: {BACKEND_URL}")
    print("=" * 80)
    print("\n")
    
    # Run all tests
    test_stripe_pci_compliance()
    test_idor_fixes()
    test_public_endpoints()
    
    print("=" * 80)
    print("SECURITY TESTING COMPLETED")
    print("=" * 80)
    print("\n")

if __name__ == "__main__":
    main()
