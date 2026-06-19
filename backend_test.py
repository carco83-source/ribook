#!/usr/bin/env python3
"""
RiBook Backend Testing - Complete Purchase, Delivery, and Pickup Flow
Tests the full order lifecycle with notification verification
"""

import requests
import json
from datetime import datetime

# Backend URL
BASE_URL = "https://language-check-10.preview.emergentagent.com/api"

# Test credentials
BUYER_EMAIL = "carco83@gmail.com"
BUYER_PASSWORD = "Test123!"
BUYER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"

ADMIN_EMAIL = "admin@ribook.it"
ADMIN_PASSWORD = "Test123!"

BOOKSTORE_NICA_EMAIL = "nica@test.com"
BOOKSTORE_NICA_PASSWORD = "Test123!"

BOOKSTORE_LPC_EMAIL = "lpc@test.com"
BOOKSTORE_LPC_PASSWORD = "Test123!"

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

def verify_notification_content(notification, expected_fields, unexpected_fields=None):
    """Verify notification contains expected fields and doesn't contain unexpected ones"""
    message = notification.get("message", "")
    title = notification.get("title", "")
    data = notification.get("data", {})
    full_text = f"{title} {message} {json.dumps(data)}"
    
    issues = []
    
    # Check expected fields
    for field in expected_fields:
        if field.lower() not in full_text.lower():
            issues.append(f"Missing expected field: {field}")
    
    # Check unexpected fields
    if unexpected_fields:
        for field in unexpected_fields:
            if field.lower() in full_text.lower():
                issues.append(f"Contains unexpected field: {field}")
    
    return len(issues) == 0, issues

print("=" * 80)
print("RiBook Backend Testing - Complete Purchase Flow")
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

# Step 5: Verify initial notifications
print("\nStep 5: Verifying initial notifications...")
# Seller should have confirmation request
seller_notifications = get_notifications(seller_id)
seller_notif = next((n for n in seller_notifications if n.get("order_id") == order_id), None)
if seller_notif:
    log_test("Seller notification created", True, 
             f"Type: {seller_notif.get('type')}")
else:
    log_test("Seller notification created", False, "No notification found for seller")

# Buyer should have pending notification
buyer_notifications = get_notifications(buyer_id)
buyer_notif = next((n for n in buyer_notifications if n.get("order_id") == order_id), None)
if buyer_notif:
    log_test("Buyer notification created", True, 
             f"Type: {buyer_notif.get('type')}")
else:
    log_test("Buyer notification created", False, "No notification found for buyer")

# Step 6: Seller confirms availability
print("\nStep 6: Seller confirms availability...")
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

# Step 7: Pay order (MOCKED Stripe payment)
print("\nStep 7: Paying order (Stripe MOCKED)...")
response = requests.post(
    f"{BASE_URL}/orders/{order_id}/pay",
    params={"user_id": buyer_id}
)

if response.status_code == 200:
    pay_data = response.json()
    new_status = pay_data.get("status")
    log_test("POST /api/orders/{order_id}/pay", True, 
             f"Payment successful. Status: {new_status}")
else:
    log_test("POST /api/orders/{order_id}/pay", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")
    exit(1)

# Step 8: Verify notifications after payment
print("\nStep 8: Verifying notifications after payment...")

# Refresh notifications
seller_notifications = get_notifications(seller_id)
buyer_notifications = get_notifications(buyer_id)

# Find the payment notification for seller
seller_payment_notif = next(
    (n for n in seller_notifications 
     if n.get("order_id") == order_id and n.get("type") in ["order_paid_deliver", "order_paid"]),
    None
)

if seller_payment_notif:
    # Seller should have: QR code, order code, book conditions, NO price in message
    has_qr = seller_payment_notif.get("show_qr") or seller_payment_notif.get("show_qr_always")
    has_code = order_code in str(seller_payment_notif.get("message", ""))
    message = seller_payment_notif.get("message", "")
    
    # Check for price in message (should NOT be there)
    has_price_in_message = "€" in message or "euro" in message.lower() or "prezzo" in message.lower()
    
    # Check for conditions
    has_conditions = "condizioni" in message.lower() or seller_payment_notif.get("book_condizioni")
    
    log_test("Seller notification has QR code", has_qr, 
             f"show_qr={has_qr}")
    log_test("Seller notification has order code", has_code, 
             f"Code {order_code} in message")
    log_test("Seller notification has book conditions", has_conditions, 
             "Conditions present")
    log_test("Seller notification does NOT have price in message", not has_price_in_message, 
             f"Price in message: {has_price_in_message}")
else:
    log_test("Seller payment notification", False, "No payment notification found for seller")

# Find the payment notification for buyer
buyer_payment_notif = next(
    (n for n in buyer_notifications 
     if n.get("order_id") == order_id and n.get("type") in ["order_paid_waiting", "order_paid"]),
    None
)

if buyer_payment_notif:
    # Buyer should have: notification about waiting for seller delivery, NO QR yet
    has_qr = buyer_payment_notif.get("show_qr") or buyer_payment_notif.get("show_qr_always")
    message = buyer_payment_notif.get("message", "")
    
    # Should mention waiting for delivery
    mentions_waiting = "riceverai" in message.lower() or "notifica" in message.lower() or "pronto" in message.lower()
    
    log_test("Buyer notification mentions waiting for delivery", mentions_waiting, 
             "Message indicates waiting")
    log_test("Buyer notification does NOT have QR yet", not has_qr, 
             f"show_qr={has_qr} (should be False or not present)")
else:
    log_test("Buyer payment notification", False, "No payment notification found for buyer")

# Check bookstore notification
print("\nStep 9: Verifying bookstore notification...")
# Try to get bookstore notifications
bookstore_notifications = get_bookstore_notifications(bookstore_id)
bookstore_notif = next(
    (n for n in bookstore_notifications 
     if n.get("order_id") == order_id),
    None
)

if bookstore_notif:
    # Bookstore should have: order code + descriptions, NO QR, NO price in message
    message = bookstore_notif.get("message", "")
    has_code = order_code in message
    has_qr = bookstore_notif.get("show_qr")
    has_price_in_message = "€" in message or "euro" in message.lower() or "prezzo" in message.lower()
    
    log_test("Bookstore notification has order code", has_code, 
             f"Code {order_code} in message")
    log_test("Bookstore notification does NOT have QR", not has_qr, 
             f"show_qr={has_qr}")
    log_test("Bookstore notification does NOT have price in message", not has_price_in_message, 
             f"Price in message: {has_price_in_message}")
else:
    log_test("Bookstore notification", False, "No notification found for bookstore")

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
else:
    log_test("POST /api/orders/{order_id}/deliver-to-bookstore", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Step 11: Verify buyer notification about delivery
print("\nStep 11: Verifying buyer notification about delivery...")
buyer_notifications = get_notifications(buyer_id)
buyer_delivery_notif = next(
    (n for n in buyer_notifications 
     if n.get("order_id") == order_id and n.get("type") == "book_at_bookstore"),
    None
)

if buyer_delivery_notif:
    message = buyer_delivery_notif.get("message", "")
    mentions_arrival = "arrivo" in message.lower() or "consegnato" in message.lower()
    log_test("Buyer notified about book delivery", mentions_arrival, 
             "Message mentions book is at bookstore")
else:
    log_test("Buyer notified about book delivery", False, 
             "No delivery notification found for buyer")

# Step 12: Bookstore confirms ready for pickup
print("\nStep 12: Bookstore confirms ready for pickup...")
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

# Step 13: Verify buyer notification with QR and conditions
print("\nStep 13: Verifying buyer notification with QR and conditions...")
buyer_notifications = get_notifications(buyer_id)
buyer_ready_notif = next(
    (n for n in buyer_notifications 
     if n.get("order_id") == order_id and n.get("type") in ["order_qr_code", "ready_for_pickup"]),
    None
)

if buyer_ready_notif:
    # Buyer should now have: QR code + book conditions
    has_qr = buyer_ready_notif.get("show_qr") or buyer_ready_notif.get("data", {}).get("show_qr")
    message = buyer_ready_notif.get("message", "")
    has_conditions = "condizioni" in message.lower()
    has_code = order_code in message
    
    log_test("Buyer notification has QR code", has_qr, 
             f"show_qr={has_qr}")
    log_test("Buyer notification has book conditions", has_conditions, 
             "Conditions mentioned in message")
    log_test("Buyer notification has order code", has_code, 
             f"Code {order_code} in message")
else:
    log_test("Buyer ready notification", False, "No ready notification found for buyer")

# Step 14: Complete pickup
print("\nStep 14: Completing pickup...")
response = requests.post(
    f"{BASE_URL}/orders/{order_id}/confirm-pickup",
    params={"user_id": buyer_id}
)

if response.status_code == 200:
    pickup_data = response.json()
    new_status = pickup_data.get("status")
    log_test("POST /api/orders/{order_id}/confirm-pickup", True, 
             f"Pickup confirmed. Status: {new_status}")
else:
    log_test("POST /api/orders/{order_id}/confirm-pickup", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Step 15: Verify order status
print("\nStep 15: Verifying final order status...")
response = requests.get(f"{BASE_URL}/orders/{order_id}")
if response.status_code == 200:
    order = response.json()
    final_status = order.get("status")
    is_completed = final_status in ["picked_up", "completed"]
    log_test("Order final status", is_completed, 
             f"Status: {final_status}")
else:
    log_test("Order final status", False, 
             f"HTTP {response.status_code}: {response.text[:200]}")

# Step 16: Test bookstore dashboard
print("\nStep 16: Testing bookstore dashboard...")
response = requests.get(f"{BASE_URL}/bookstore/{bookstore_id}/orders")
if response.status_code == 200:
    dashboard_data = response.json()
    orders = dashboard_data.get("orders", [])
    log_test("GET /api/bookstore/{bookstore_id}/orders", True, 
             f"Retrieved {len(orders)} orders")
    
    # Check if our order is in the list (it might not be if status is completed)
    our_order = next((o for o in orders if o.get("id") == order_id), None)
    if our_order:
        print(f"    Our order found in dashboard with status: {our_order.get('status')}")
    else:
        print(f"    Our order not in dashboard (likely completed and filtered out)")
else:
    log_test("GET /api/bookstore/{bookstore_id}/orders", False, 
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

# Exit with appropriate code
exit(0 if failed_count == 0 else 1)
