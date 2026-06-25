#!/usr/bin/env python3
"""
Backend API Testing Script for RiBook App - IBAN Saving Functionality
Tests the complete IBAN saving flow via PUT /api/users/{user_id}

Bug reported: User reported "Impossibile salvare l'IBAN" error even though IBAN was being saved
Fix applied: Added iban, nome, cognome, email, telefono fields to UserPublic model
"""

import requests
import json
import sys

# Backend URL from environment
BACKEND_URL = "https://language-check-10.preview.emergentagent.com/api"

# Test user ID from review request
TEST_USER_ID = "3b633bd5-12ae-4050-9393-9e842df662c5"
TEST_IBAN = "IT60X0542811101000000123456"

def print_test_header(test_name):
    """Print formatted test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_result(success, message):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")

def test_get_user_before_update():
    """Test 1: GET user to verify it exists"""
    print_test_header("Step 1: GET User Before Update")
    
    url = f"{BACKEND_URL}/users/{TEST_USER_ID}"
    print(f"URL: {url}")
    
    try:
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            user_data = response.json()
            print(f"User Data: {json.dumps(user_data, indent=2)}")
            
            # Check if user has required fields
            if "id" in user_data and user_data["id"] == TEST_USER_ID:
                print_result(True, f"User exists with ID: {TEST_USER_ID}")
                
                # Check current IBAN value
                current_iban = user_data.get("iban")
                print(f"Current IBAN: {current_iban}")
                
                return True, user_data
            else:
                print_result(False, "User ID mismatch in response")
                return False, None
        else:
            print(f"Response: {response.text}")
            print_result(False, f"Failed to get user: {response.status_code}")
            return False, None
            
    except Exception as e:
        print_result(False, f"Exception occurred: {str(e)}")
        return False, None

def test_put_user_with_iban():
    """Test 2: PUT user with IBAN to update"""
    print_test_header("Step 2: PUT User with IBAN")
    
    url = f"{BACKEND_URL}/users/{TEST_USER_ID}"
    print(f"URL: {url}")
    
    payload = {"iban": TEST_IBAN}
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.put(url, json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            user_data = response.json()
            print(f"Response Data: {json.dumps(user_data, indent=2)}")
            
            # Verify response contains iban field
            if "iban" not in user_data:
                print_result(False, "❌ CRITICAL: Response does not contain 'iban' field")
                return False, None
            
            # Verify IBAN value matches
            if user_data["iban"] != TEST_IBAN:
                print_result(False, f"❌ CRITICAL: IBAN mismatch - expected {TEST_IBAN}, got {user_data['iban']}")
                return False, None
            
            # Verify response contains other required fields
            required_fields = ["id", "username", "is_premium"]
            missing_fields = [f for f in required_fields if f not in user_data]
            if missing_fields:
                print_result(False, f"❌ CRITICAL: Response missing required fields: {missing_fields}")
                return False, None
            
            # Verify response contains the additional fields mentioned in the fix
            additional_fields = ["nome", "cognome", "email", "telefono"]
            present_fields = [f for f in additional_fields if f in user_data]
            print(f"✅ Additional fields present in response: {present_fields}")
            
            print_result(True, f"IBAN successfully updated to: {TEST_IBAN}")
            print_result(True, f"Response contains all required fields including: {', '.join(additional_fields)}")
            return True, user_data
            
        else:
            print(f"Response: {response.text}")
            print_result(False, f"❌ CRITICAL: Failed to update user - Status {response.status_code}")
            return False, None
            
    except Exception as e:
        print_result(False, f"❌ CRITICAL: Exception occurred: {str(e)}")
        return False, None

def test_get_user_after_update():
    """Test 3: GET user again to verify IBAN persisted"""
    print_test_header("Step 3: GET User After Update - Verify Persistence")
    
    url = f"{BACKEND_URL}/users/{TEST_USER_ID}"
    print(f"URL: {url}")
    
    try:
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            user_data = response.json()
            print(f"User Data: {json.dumps(user_data, indent=2)}")
            
            # Verify IBAN persisted
            if "iban" not in user_data:
                print_result(False, "❌ CRITICAL: IBAN field not found in user data after update")
                return False
            
            if user_data["iban"] != TEST_IBAN:
                print_result(False, f"❌ CRITICAL: IBAN not persisted correctly - expected {TEST_IBAN}, got {user_data['iban']}")
                return False
            
            print_result(True, f"IBAN correctly persisted in database: {TEST_IBAN}")
            return True
            
        else:
            print(f"Response: {response.text}")
            print_result(False, f"Failed to get user: {response.status_code}")
            return False
            
    except Exception as e:
        print_result(False, f"Exception occurred: {str(e)}")
        return False

def run_all_tests():
    """Run all IBAN saving tests"""
    print("\n" + "="*80)
    print("IBAN SAVING FUNCTIONALITY TEST SUITE")
    print("Testing Bug Fix: UserPublic model now includes iban, nome, cognome, email, telefono")
    print("="*80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test User ID: {TEST_USER_ID}")
    print(f"Test IBAN: {TEST_IBAN}")
    
    results = []
    
    # Test 1: GET user before update
    success, user_data = test_get_user_before_update()
    results.append(("GET User Before Update", success))
    
    if not success:
        print("\n❌ CRITICAL: Cannot proceed with tests - user does not exist")
        print_summary(results)
        return False
    
    # Test 2: PUT user with IBAN
    success, updated_data = test_put_user_with_iban()
    results.append(("PUT User with IBAN", success))
    
    if not success:
        print("\n❌ CRITICAL: Cannot proceed with persistence test - update failed")
        print_summary(results)
        return False
    
    # Test 3: GET user after update to verify persistence
    success = test_get_user_after_update()
    results.append(("GET User After Update (Persistence)", success))
    
    # Print summary
    print_summary(results)
    
    total_tests = len(results)
    passed_tests = sum(1 for _, success in results if success)
    
    if passed_tests == total_tests:
        print("\n🎉 ALL TESTS PASSED! IBAN saving functionality is working correctly.")
        print("✅ Bug Fix Verified: UserPublic model correctly returns iban field")
        print("✅ No Pydantic validation errors")
        print("✅ IBAN is correctly saved and persisted in database")
        return True
    else:
        print(f"\n⚠️  {total_tests - passed_tests} test(s) failed.")
        print("❌ IBAN saving functionality has issues that need to be addressed")
        return False

def print_summary(results):
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    total_tests = len(results)
    passed_tests = sum(1 for _, success in results if success)
    print(f"\nTotal: {passed_tests}/{total_tests} tests passed")

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
