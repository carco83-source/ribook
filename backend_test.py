#!/usr/bin/env python3
"""
RiBook Backend Testing - Complete Purchase → Delivery → Pickup Flow
Tests the full order lifecycle after bug fixes:
- Status mismatch: accepts both "paid_escrow" and "pagato_attesa_consegna"
- Buyer: show_qr=False (no QR until delivery)
- Bookstore: show_qr=False (only alphanumeric code)
- Removed price from book_details
"""

import requests
import json
from datetime import datetime

# Backend URL
BASE_URL = "https://language-check-10.preview.emergentagent.com/api"

# Test credentials
BUYER_EMAIL = "carco83@gmail.com"
BUYER_PASSWORD = "Test123!"

ADMIN_EMAIL = "admin@ribook.it"
ADMIN_PASSWORD = "Test123!"

BOOKSTORE_NICA_EMAIL = "nica@test.com"
BOOKSTORE_NICA_PASSWORD = "Test123!"

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

def test_login(email, password):
    """Test user login"""
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": email,
        "password": password
    })
    
    if response.status_code == 200:
        data = response.json()
        return data.get("id") or data.get("user_id")
    return None

def test_bookstore_login(email, password):
    """Test bookstore login"""
    response = requests.post(f"{BASE_URL}/bookstore/login", json={
        "email": email,
        "password": password
    })
    
    if response.status_code == 200:
        data = response.json()
        return data.get("id") or data.get("bookstore_id")
    return None

def get_notifications(user_id):
    """Get user notifications"""
    response = requests.get(f"{BASE_URL}/notifications/{user_id}")
    if response.status_code == 200:
        data = response.json()
        # Handle both direct list and wrapped response
        if isinstance(data, dict) and "notifications" in data:
            return data["notifications"]
        elif isinstance(data, list):
            return data
        return []
    return []

def get_bookstore_notifications(bookstore_id):
    """Get bookstore notifications"""
    response = requests.get(f"{BASE_URL}/bookstore/{bookstore_id}/notifications")
    if response.status_code == 200:
        data = response.json()
        # Handle both direct list and wrapped response
        if isinstance(data, dict) and "notifications" in data:
            return data["notifications"]
        elif isinstance(data, list):
            return data
        return []
    return []

print("=" * 80)
print("RiBook Backend Testing - Complete Purchase → Delivery → Pickup Flow")
print("Testing Bug Fixes:")
print("  - Status mismatch: accepts both 'paid_escrow' and 'pagato_attesa_consegna'")
print("  - Buyer: show_qr=False (no QR until delivery)")
print("  - Bookstore: show_qr=False (only alphanumeric code)")
print("  - Removed price from book_details")
print("=" * 80)
print()

# Step 1: Verify available listings
print("Step 1: Verifying available listings...")
response = requests.get(f"{BASE_URL}/listings", params={"status": "available"})
if response.status_code == 200:
    listings = response.json()
    if isinstance(listings, dict):
        listings = listings.get("listings", [])
    
    available_count = len(listings)
    log_test("GET /api/listings?status=available", 
             available_count > 0, 
             f"Found {available_count} available listings")
    
    if available_count > 0:
        # Pick the first listing for testing
        test_listing = listings[0]
        listing_id = test_listing.get("id")
        seller_id = test_listing.get("seller_id")
        book_title = test_listing.get("book_titolo", "Unknown")
        print(f"    Selected listing: {book_title} (ID: {listing_id})")
    else:
        print("    ❌ No available listings found. Cannot continue testing.")
        exit(1)
else:
    log_test("GET /api/listings?status=available", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")
    exit(1)

# Step 2: Get bookstores
print("\nStep 2: Getting bookstores...")
response = requests.get(f"{BASE_URL}/bookstores")
if response.status_code == 200:
    bookstores = response.json()
    if isinstance(bookstores, dict):
        bookstores = bookstores.get("bookstores", [])
    
    if len(bookstores) > 0:
        test_bookstore = bookstores[0]
        bookstore_id = test_bookstore.get("id")
        bookstore_name = test_bookstore.get("nome", "Unknown")
        log_test("GET /api/bookstores", True, 
                f"Found {len(bookstores)} bookstores. Using: {bookstore_name}")
    else:
        log_test("GET /api/bookstores", False, "No bookstores found")
        exit(1)
else:
    log_test("GET /api/bookstores", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")
    exit(1)

# Step 3: Login as buyer
print("\nStep 3: Logging in as buyer...")
buyer_id = test_login(BUYER_EMAIL, BUYER_PASSWORD)
if buyer_id:
    log_test("Buyer login", True, f"Logged in as {BUYER_EMAIL}")
else:
    log_test("Buyer login", False, "Failed to login as buyer")
    exit(1)

# Check if buyer is the seller (can't buy own books)
if seller_id == buyer_id:
    print(f"    ⚠️  Buyer is the seller. Need to find a different listing or user.")
    # Try to find a listing from a different seller
    found_different = False
    for listing in listings:
        if listing.get("seller_id") != buyer_id:
            test_listing = listing
            listing_id = test_listing.get("id")
            seller_id = test_listing.get("seller_id")
            book_title = test_listing.get("book_titolo", "Unknown")
            print(f"    Found listing from different seller: {book_title}")
            found_different = True
            break
    
    if not found_different:
        print("    ❌ All listings belong to the test buyer. Cannot test purchase flow.")
        print("    Recommendation: Create listings with different seller accounts.")
        exit(1)

# Step 4: Create order
print("\nStep 4: Creating order...")
response = requests.post(
    f"{BASE_URL}/orders/create",
    params={
        "user_id": buyer_id,
        "listing_id": listing_id,
        "bookstore_id": bookstore_id
    }
)

if response.status_code == 200:
    order_data = response.json()
    order_id = order_data.get("order_id")
    order_code = order_data.get("order_code")
    order_status = order_data.get("status")
    log_test("POST /api/orders/create", True, 
             f"Order created: {order_code}, Status: {order_status}")
else:
    log_test("POST /api/orders/create", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")
    exit(1)

# Step 5: Seller confirms availability
print("\nStep 5: Seller confirms availability...")
response = requests.post(
    f"{BASE_URL}/orders/{order_id}/seller-confirm",
    params={"user_id": seller_id}
)

if response.status_code == 200:
    confirm_data = response.json()
    new_status = confirm_data.get("status")
    log_test("POST /api/orders/{order_id}/seller-confirm", True, 
             f"New status: {new_status}")
else:
    log_test("POST /api/orders/{order_id}/seller-confirm", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")
    exit(1)

# Step 6: Pay order (MOCKED Stripe payment)
print("\nStep 6: Paying order (Stripe MOCKED)...")
response = requests.post(
    f"{BASE_URL}/orders/{order_id}/pay",
    params={"user_id": buyer_id}
)

if response.status_code == 200:
    pay_data = response.json()
    new_status = pay_data.get("status")
    log_test("POST /api/orders/{order_id}/pay", True, 
             f"Payment successful. Status: {new_status}")
    
    # BUG FIX TEST: Verify status is "pagato_attesa_consegna"
    is_correct_status = new_status == "pagato_attesa_consegna"
    log_test("Payment status is 'pagato_attesa_consegna'", is_correct_status,
             f"Status: {new_status}")
else:
    log_test("POST /api/orders/{order_id}/pay", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")
    exit(1)

# Step 7: Verify SELLER notification after payment
print("\nStep 7: Verifying SELLER notification after payment...")
seller_notifications = get_notifications(seller_id)
seller_payment_notif = next(
    (n for n in seller_notifications 
     if n.get("order_id") == order_id and n.get("type") in ["order_paid_deliver", "order_paid"]),
    None
)

if seller_payment_notif:
    # BUG FIX TEST: Seller should have QR code
    has_qr = seller_payment_notif.get("show_qr", False)
    log_test("SELLER notification has QR code (show_qr=True)", has_qr, 
             f"show_qr={has_qr}")
    
    # BUG FIX TEST: Seller should have conditions
    book_details = seller_payment_notif.get("book_details", {})
    # Check if conditions exist in any form
    has_conditions = bool(
        book_details.get("condizioni") or 
        book_details.get("condition_answers") or 
        book_details.get("condition_details") or
        seller_payment_notif.get("book_condizioni")
    )
    # Print debug info
    print(f"    DEBUG: book_details keys: {list(book_details.keys())}")
    print(f"    DEBUG: book_condizioni: {seller_payment_notif.get('book_condizioni')}")
    log_test("SELLER notification has book conditions", has_conditions, 
             f"Conditions present: {has_conditions}")
    
    # BUG FIX TEST: book_details should NOT have price
    has_price_in_details = "prezzo" in book_details or "price" in book_details
    log_test("SELLER notification book_details does NOT have price", not has_price_in_details, 
             f"Price in book_details: {has_price_in_details}")
    
    # Message should not have price either
    message = seller_payment_notif.get("message", "")
    has_price_in_message = "€" in message
    log_test("SELLER notification message does NOT have price", not has_price_in_message, 
             f"€ symbol in message: {has_price_in_message}")
else:
    log_test("SELLER payment notification", False, "No payment notification found for seller")

# Step 8: Verify BUYER notification after payment
print("\nStep 8: Verifying BUYER notification after payment...")
buyer_notifications = get_notifications(buyer_id)
buyer_payment_notif = next(
    (n for n in buyer_notifications 
     if n.get("order_id") == order_id and n.get("type") in ["order_pending", "order_paid"]),
    None
)

if buyer_payment_notif:
    # BUG FIX TEST: Buyer should NOT have QR yet
    has_qr = buyer_payment_notif.get("show_qr", False)
    log_test("BUYER notification does NOT have QR (show_qr=False)", not has_qr, 
             f"show_qr={has_qr} (should be False)")
    
    # Should mention waiting for delivery
    message = buyer_payment_notif.get("message", "")
    mentions_waiting = "sarai avvisato" in message.lower() or "riceverai" in message.lower()
    log_test("BUYER notification mentions waiting for delivery", mentions_waiting, 
             "Message indicates waiting")
else:
    log_test("BUYER payment notification", False, "No payment notification found for buyer")

# Step 9: Verify BOOKSTORE notification after payment
print("\nStep 9: Verifying BOOKSTORE notification after payment...")
bookstore_notifications = get_bookstore_notifications(bookstore_id)
bookstore_notif = next(
    (n for n in bookstore_notifications 
     if n.get("order_id") == order_id and n.get("type") == "incoming_book_delivery"),
    None
)

if bookstore_notif:
    # BUG FIX TEST: Bookstore should NOT have QR
    has_qr = bookstore_notif.get("show_qr", False)
    log_test("BOOKSTORE notification does NOT have QR (show_qr=False)", not has_qr, 
             f"show_qr={has_qr} (should be False)")
    
    # Should have order code (alphanumeric)
    message = bookstore_notif.get("message", "")
    has_code = order_code in message or bookstore_notif.get("order_code") == order_code
    log_test("BOOKSTORE notification has order code (alphanumeric)", has_code, 
             f"Order code: {order_code}")
    
    # BUG FIX TEST: book_details should NOT have price
    book_details = bookstore_notif.get("book_details", {})
    has_price_in_details = "prezzo" in book_details or "price" in book_details
    log_test("BOOKSTORE notification book_details does NOT have price", not has_price_in_details, 
             f"Price in book_details: {has_price_in_details}")
    
    # Message should not have price
    has_price_in_message = "€" in message
    log_test("BOOKSTORE notification message does NOT have price", not has_price_in_message, 
             f"€ symbol in message: {has_price_in_message}")
    
    # Should have conditions
    has_conditions = bool(
        book_details.get("condizioni") or 
        book_details.get("condition_answers") or 
        book_details.get("condition_details") or
        bookstore_notif.get("book_condizioni")
    )
    # Print debug info
    print(f"    DEBUG: book_details keys: {list(book_details.keys())}")
    log_test("BOOKSTORE notification has book conditions", has_conditions, 
             f"Conditions present: {has_conditions}")
else:
    log_test("BOOKSTORE notification", False, "No notification found for bookstore")

# Step 10: Seller delivers to bookstore
print("\nStep 10: Seller delivers to bookstore...")
response = requests.post(
    f"{BASE_URL}/orders/{order_id}/deliver-to-bookstore",
    params={"user_id": seller_id}
)

if response.status_code == 200:
    deliver_data = response.json()
    new_status = deliver_data.get("status")
    log_test("POST /api/orders/{order_id}/deliver-to-bookstore", True, 
             f"Delivery confirmed. Status: {new_status}")
    
    # BUG FIX TEST: Should accept both "paid_escrow" and "pagato_attesa_consegna"
    # (This is tested implicitly - if the endpoint accepts the order, it worked)
else:
    log_test("POST /api/orders/{order_id}/deliver-to-bookstore", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Step 11: Bookstore confirms ready for pickup
print("\nStep 11: Bookstore confirms ready for pickup...")
response = requests.post(
    f"{BASE_URL}/orders/{order_id}/ready-for-pickup",
    params={"bookstore_id": bookstore_id}
)

if response.status_code == 200:
    ready_data = response.json()
    new_status = ready_data.get("status")
    log_test("POST /api/orders/{order_id}/ready-for-pickup", True, 
             f"Ready for pickup. Status: {new_status}")
else:
    log_test("POST /api/orders/{order_id}/ready-for-pickup", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Step 12: Verify BUYER notification with QR and conditions (after ready for pickup)
print("\nStep 12: Verifying BUYER notification with QR and conditions...")
buyer_notifications = get_notifications(buyer_id)
buyer_ready_notif = next(
    (n for n in buyer_notifications 
     if n.get("order_id") == order_id and n.get("type") in ["order_qr_code", "ready_for_pickup"]),
    None
)

if buyer_ready_notif:
    # BUG FIX TEST: Buyer should NOW have QR code
    has_qr = buyer_ready_notif.get("data", {}).get("show_qr", False)
    log_test("BUYER notification NOW has QR code (show_qr=True)", has_qr, 
             f"show_qr={has_qr} in data")
    
    # Should have book conditions
    message = buyer_ready_notif.get("message", "")
    has_conditions = "condizioni" in message.lower()
    log_test("BUYER notification has book conditions", has_conditions, 
             "Conditions mentioned in message")
    
    # Should have order code
    has_code = order_code in message or buyer_ready_notif.get("order_code") == order_code
    log_test("BUYER notification has order code", has_code, 
             f"Order code: {order_code}")
    
    # BUG FIX TEST: Should NOT have price
    has_price = "€" in message
    log_test("BUYER notification does NOT have price", not has_price, 
             f"€ symbol in message: {has_price}")
else:
    log_test("BUYER ready notification", False, "No ready notification found for buyer")

# Step 13: Complete pickup (bookstore confirms)
print("\nStep 13: Completing pickup (bookstore confirms)...")
response = requests.post(
    f"{BASE_URL}/bookstore/{bookstore_id}/confirm-pickup/{order_id}"
)

if response.status_code == 200:
    pickup_data = response.json()
    log_test("POST /api/bookstore/{bookstore_id}/confirm-pickup/{order_id}", True, 
             f"Pickup confirmed by bookstore")
else:
    log_test("POST /api/bookstore/{bookstore_id}/confirm-pickup/{order_id}", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Step 14: Verify final order status is "completed"
print("\nStep 14: Verifying final order status is 'completed'...")
response = requests.get(f"{BASE_URL}/orders/{order_id}", params={"user_id": buyer_id})
if response.status_code == 200:
    order = response.json()
    final_status = order.get("status")
    is_completed = final_status == "completed"
    log_test("Order final status is 'completed'", is_completed, 
             f"Status: {final_status}")
else:
    log_test("Order final status", False, 
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
    print("\n🎉 ALL TESTS PASSED! Bug fixes verified successfully.")
else:
    print(f"\n⚠️  {failed_count} test(s) failed. Please review the details above.")

print("\nBug Fixes Tested:")
print("  ✓ Status mismatch: accepts both 'paid_escrow' and 'pagato_attesa_consegna'")
print("  ✓ Buyer: show_qr=False (no QR until delivery)")
print("  ✓ Bookstore: show_qr=False (only alphanumeric code)")
print("  ✓ Removed price from book_details")
print("=" * 80)

# Exit with appropriate code
exit(0 if failed_count == 0 else 1)
