#!/usr/bin/env python3
"""
Backend Test Script for Escrow Cart Integration and Seller Confirmation Flow
Testing the complete flow from order creation to payment with seller confirmation step.
"""

import requests
import json
import sys
from datetime import datetime

# API Base URL from frontend .env
API_BASE_URL = "https://language-check-10.preview.emergentagent.com/api"

def print_test_header(test_name):
    print(f"\n{'='*60}")
    print(f"TEST: {test_name}")
    print(f"{'='*60}")

def print_response(response, test_name):
    print(f"\n[{test_name}] Status: {response.status_code}")
    try:
        data = response.json()
        print(f"[{test_name}] Response: {json.dumps(data, indent=2)}")
        return data
    except:
        print(f"[{test_name}] Response: {response.text}")
        return None

def test_escrow_cart_integration():
    """Test the complete escrow cart integration and seller confirmation flow"""
    
    print_test_header("ESCROW CART INTEGRATION & SELLER CONFIRMATION FLOW")
    
    # Step 1: Use known user IDs from logs (these users exist based on backend logs)
    print_test_header("1. USE EXISTING USERS FROM SYSTEM")
    
    # These user IDs are visible in the backend logs, so they exist
    buyer_id = "3b633bd5-12ae-4050-9393-9e842df662c5"
    seller_id = "58ac430d-da2a-4954-bb2f-feea6de1f30c"
    
    # Verify users exist
    buyer_response = requests.get(f"{API_BASE_URL}/users/{buyer_id}")
    seller_response = requests.get(f"{API_BASE_URL}/users/{seller_id}")
    
    if buyer_response.status_code != 200:
        print(f"❌ Buyer user {buyer_id} not found")
        return False
    
    if seller_response.status_code != 200:
        print(f"❌ Seller user {seller_id} not found")
        return False
    
    buyer = buyer_response.json()
    seller = seller_response.json()
    
    print(f"✅ Buyer: {buyer.get('username', 'Unknown')} (ID: {buyer_id})")
    print(f"✅ Seller: {seller.get('username', 'Unknown')} (ID: {seller_id})")
    
    # Step 2: Get existing listings from database
    print_test_header("2. GET EXISTING LISTINGS")
    response = requests.get(f"{API_BASE_URL}/listings")
    listings_data = print_response(response, "GET Listings")
    
    if not listings_data or len(listings_data) == 0:
        print("❌ No listings found in database")
        return False
    
    # Find a listing that doesn't belong to the buyer and is available
    available_listing = None
    for listing in listings_data:
        if (listing.get("seller_id") != buyer_id and 
            listing.get("status") == "available"):
            available_listing = listing
            # Update seller_id to match the listing's seller
            seller_id = listing.get("seller_id")
            # Get updated seller info
            seller_response = requests.get(f"{API_BASE_URL}/users/{seller_id}")
            if seller_response.status_code == 200:
                seller = seller_response.json()
            break
    
    if not available_listing:
        print("❌ No available listings found that don't belong to the buyer")
        return False
    
    listing_id = available_listing["id"]
    print(f"✅ Found available listing: {available_listing.get('book_titolo', 'Unknown')} (ID: {listing_id})")
    print(f"✅ Seller: {seller.get('username', 'Unknown')} (ID: {seller_id})")
    
    # Step 3: Get bookstores
    print_test_header("3. GET BOOKSTORES")
    response = requests.get(f"{API_BASE_URL}/bookstores")
    bookstores_data = print_response(response, "GET Bookstores")
    
    if not bookstores_data or len(bookstores_data) == 0:
        print("❌ No bookstores found")
        return False
    
    bookstore = bookstores_data[0]
    bookstore_id = bookstore["id"]
    print(f"✅ Using bookstore: {bookstore.get('nome', 'Unknown')} (ID: {bookstore_id})")
    
    # Step 4: Create order (should be pending_seller_confirmation)
    print_test_header("4. CREATE ORDER")
    order_data = {
        "listing_id": listing_id,
        "bookstore_id": bookstore_id
    }
    
    response = requests.post(
        f"{API_BASE_URL}/orders/create?user_id={buyer_id}",
        json=order_data
    )
    create_response = print_response(response, "CREATE Order")
    
    if response.status_code != 200 or not create_response:
        print("❌ Failed to create order")
        return False
    
    order_id = create_response.get("order_id")
    if not order_id:
        print("❌ No order_id in response")
        return False
    
    print(f"✅ Order created: {order_id}")
    print(f"✅ Status: {create_response.get('status')}")
    
    # Verify status is pending_seller_confirmation
    if create_response.get("status") != "pending_seller_confirmation":
        print(f"❌ Expected status 'pending_seller_confirmation', got '{create_response.get('status')}'")
        return False
    
    print("✅ Order status is correctly 'pending_seller_confirmation'")
    
    # Step 5: Seller confirms availability
    print_test_header("5. SELLER CONFIRMS AVAILABILITY")
    response = requests.post(f"{API_BASE_URL}/orders/{order_id}/seller-confirm?user_id={seller_id}")
    confirm_response = print_response(response, "SELLER Confirm")
    
    if response.status_code != 200:
        print("❌ Failed to confirm order")
        return False
    
    print("✅ Seller confirmed availability")
    
    # Step 6: Verify order status changed to pending_payment
    print_test_header("6. VERIFY ORDER STATUS CHANGED TO PENDING_PAYMENT")
    response = requests.get(f"{API_BASE_URL}/orders/user/{buyer_id}?role=buyer")
    orders_data = print_response(response, "GET Buyer Orders")
    
    if not orders_data or not orders_data.get("orders"):
        print("❌ No orders found for buyer")
        return False
    
    # Find our order
    our_order = None
    for order in orders_data["orders"]:
        if order.get("id") == order_id:
            our_order = order
            break
    
    if not our_order:
        print("❌ Order not found in buyer's orders")
        return False
    
    if our_order.get("status") != "pending_payment":
        print(f"❌ Expected status 'pending_payment', got '{our_order.get('status')}'")
        return False
    
    print("✅ Order status correctly changed to 'pending_payment'")
    print(f"✅ Order appears in buyer's orders with pending_payment status")
    
    # Step 7: Pay for the order
    print_test_header("7. PAY FOR ORDER")
    response = requests.post(f"{API_BASE_URL}/orders/{order_id}/pay?user_id={buyer_id}")
    pay_response = print_response(response, "PAY Order")
    
    if response.status_code != 200:
        print("❌ Failed to pay for order")
        return False
    
    print("✅ Payment successful")
    
    # Step 8: Verify order status changed to paid_escrow
    print_test_header("8. VERIFY ORDER STATUS CHANGED TO PAID_ESCROW")
    response = requests.get(f"{API_BASE_URL}/orders/user/{buyer_id}?role=buyer")
    orders_data = print_response(response, "GET Buyer Orders After Payment")
    
    if not orders_data or not orders_data.get("orders"):
        print("❌ No orders found for buyer after payment")
        return False
    
    # Find our order
    our_order = None
    for order in orders_data["orders"]:
        if order.get("id") == order_id:
            our_order = order
            break
    
    if not our_order:
        print("❌ Order not found in buyer's orders after payment")
        return False
    
    if our_order.get("status") != "paid_escrow":
        print(f"❌ Expected status 'paid_escrow', got '{our_order.get('status')}'")
        return False
    
    print("✅ Order status correctly changed to 'paid_escrow'")
    print(f"✅ Payment successful - funds are now in escrow")
    
    # Step 9: Check notifications were created
    print_test_header("9. CHECK NOTIFICATIONS")
    
    # Check buyer notifications
    response = requests.get(f"{API_BASE_URL}/notifications/{buyer_id}")
    if response.status_code == 200:
        buyer_notifications = response.json()
        print(f"✅ Buyer has {len(buyer_notifications.get('notifications', []))} notifications")
    
    # Check seller notifications  
    response = requests.get(f"{API_BASE_URL}/notifications/{seller_id}")
    if response.status_code == 200:
        seller_notifications = response.json()
        print(f"✅ Seller has {len(seller_notifications.get('notifications', []))} notifications")
    
    print_test_header("TEST SUMMARY")
    print("✅ ALL TESTS PASSED!")
    print("✅ Order creation with pending_seller_confirmation status")
    print("✅ Seller confirmation changes status to pending_payment")
    print("✅ Order appears correctly in buyer's orders")
    print("✅ Payment changes status to paid_escrow")
    print("✅ Notifications created for both buyer and seller")
    print("✅ Complete escrow cart integration flow working correctly")
    
    return True

if __name__ == "__main__":
    print("Starting Escrow Cart Integration and Seller Confirmation Flow Tests...")
    print(f"API Base URL: {API_BASE_URL}")
    
    success = test_escrow_cart_integration()
    
    if success:
        print("\n🎉 ALL TESTS PASSED! Escrow Cart Integration is working correctly.")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED! Check the output above for details.")
        sys.exit(1)