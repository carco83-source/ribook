#!/usr/bin/env python3
"""
Backend Test for PDF Generation Endpoint
Tests the /api/profiles/{user_id}/children/{child_id}/books-pdf endpoint
"""

import requests
import sys

# Backend URL
BACKEND_URL = "http://localhost:8001"

# Test data
USER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"
CHILDREN = {
    "Annarita": "6189dcbf-b5af-4f46-9262-ff94b4e574ed",
    "A": "7958e114-a916-4cb1-9b1c-e8a741d712e6",
    "Laica": "445855bf-53c4-4c79-9725-799a124b5543"
}

def test_pdf_generation():
    """Test PDF generation for all children"""
    print("=" * 80)
    print("TESTING PDF GENERATION ENDPOINT")
    print("=" * 80)
    print()
    
    all_passed = True
    results = []
    
    for child_name, child_id in CHILDREN.items():
        print(f"\n{'=' * 80}")
        print(f"Testing PDF generation for: {child_name} (ID: {child_id})")
        print(f"{'=' * 80}")
        
        url = f"{BACKEND_URL}/api/profiles/{USER_ID}/children/{child_id}/books-pdf"
        
        try:
            # Make request
            print(f"📡 Calling: GET {url}")
            response = requests.get(url, timeout=30)
            
            # Test 1: Check status code
            print(f"\n✓ Test 1: Status Code")
            print(f"  Expected: 200")
            print(f"  Actual: {response.status_code}")
            
            if response.status_code != 200:
                print(f"  ❌ FAILED - Status code is not 200")
                print(f"  Response: {response.text[:500]}")
                all_passed = False
                results.append({
                    "child": child_name,
                    "status": "FAILED",
                    "reason": f"Status code {response.status_code}"
                })
                continue
            else:
                print(f"  ✅ PASSED")
            
            # Test 2: Check content type
            print(f"\n✓ Test 2: Content Type")
            content_type = response.headers.get('Content-Type', '')
            print(f"  Expected: application/pdf")
            print(f"  Actual: {content_type}")
            
            if 'application/pdf' not in content_type:
                print(f"  ⚠️  WARNING - Content type is not application/pdf")
            else:
                print(f"  ✅ PASSED")
            
            # Test 3: Check PDF signature
            print(f"\n✓ Test 3: PDF Signature")
            content = response.content
            pdf_signature = content[:4]
            print(f"  Expected: b'%PDF'")
            print(f"  Actual: {pdf_signature}")
            
            if pdf_signature != b'%PDF':
                print(f"  ❌ FAILED - Content does not start with %PDF")
                all_passed = False
                results.append({
                    "child": child_name,
                    "status": "FAILED",
                    "reason": "Not a valid PDF (missing %PDF signature)"
                })
                continue
            else:
                print(f"  ✅ PASSED")
            
            # Test 4: Check file size
            print(f"\n✓ Test 4: File Size")
            file_size = len(content)
            file_size_kb = file_size / 1024
            print(f"  Expected: > 5 KB")
            print(f"  Actual: {file_size_kb:.2f} KB ({file_size} bytes)")
            
            if file_size < 5120:  # 5KB = 5120 bytes
                print(f"  ❌ FAILED - File size is less than 5KB")
                all_passed = False
                results.append({
                    "child": child_name,
                    "status": "FAILED",
                    "reason": f"File size too small ({file_size_kb:.2f} KB)"
                })
                continue
            else:
                print(f"  ✅ PASSED")
            
            # Test 5: Check Content-Disposition header
            print(f"\n✓ Test 5: Content-Disposition Header")
            content_disposition = response.headers.get('Content-Disposition', '')
            print(f"  Header: {content_disposition}")
            
            if 'attachment' in content_disposition and 'filename=' in content_disposition:
                print(f"  ✅ PASSED - Proper download header present")
            else:
                print(f"  ⚠️  WARNING - Content-Disposition header not properly set")
            
            # All tests passed for this child
            print(f"\n{'=' * 80}")
            print(f"✅ ALL TESTS PASSED for {child_name}")
            print(f"{'=' * 80}")
            
            results.append({
                "child": child_name,
                "status": "PASSED",
                "size_kb": file_size_kb
            })
            
        except requests.exceptions.Timeout:
            print(f"\n❌ FAILED - Request timeout after 30 seconds")
            all_passed = False
            results.append({
                "child": child_name,
                "status": "FAILED",
                "reason": "Request timeout"
            })
        except requests.exceptions.ConnectionError as e:
            print(f"\n❌ FAILED - Connection error: {e}")
            all_passed = False
            results.append({
                "child": child_name,
                "status": "FAILED",
                "reason": f"Connection error: {e}"
            })
        except Exception as e:
            print(f"\n❌ FAILED - Unexpected error: {e}")
            all_passed = False
            results.append({
                "child": child_name,
                "status": "FAILED",
                "reason": f"Unexpected error: {e}"
            })
    
    # Print summary
    print(f"\n\n{'=' * 80}")
    print("TEST SUMMARY")
    print(f"{'=' * 80}")
    
    for result in results:
        status_icon = "✅" if result["status"] == "PASSED" else "❌"
        print(f"{status_icon} {result['child']}: {result['status']}", end="")
        if result["status"] == "PASSED":
            print(f" (Size: {result['size_kb']:.2f} KB)")
        else:
            print(f" - {result['reason']}")
    
    print(f"\n{'=' * 80}")
    if all_passed:
        print("✅ ALL TESTS PASSED - PDF generation endpoint is working correctly!")
        print(f"{'=' * 80}")
        return 0
    else:
        print("❌ SOME TESTS FAILED - Please review the errors above")
        print(f"{'=' * 80}")
        return 1

if __name__ == "__main__":
    exit_code = test_pdf_generation()
    sys.exit(exit_code)
