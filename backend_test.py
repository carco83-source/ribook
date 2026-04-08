#!/usr/bin/env python3
"""
Backend API Testing for RiLiBro Escrow Payment System
Tests the complete escrow payment flow as specified in the review request.
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://language-check-10.preview.emergentagent.com/api"
BUYER_USER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"

class EscrowPaymentTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.buyer_id = BUYER_USER_ID
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name, success, details, response_data=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        if response_data and not success:
            print(f"   Response: {json.dumps(response_data, indent=2)}")
    
    def make_request(self, method, endpoint, **kwargs):
        """Make HTTP request with error handling"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.request(method, url, **kwargs)
            return response
        except Exception as e:
            return None
    
    def test_get_listings(self):
        """Test 1: Get available listings"""
        print("\n=== Test 1: Get Available Listings ===")
        
        response = self.make_request("GET", "/listings")
        if not response:
            self.log_test("Get Listings", False, "Request failed - connection error")
            return None
            
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                # Find a listing from a different seller than our buyer
                suitable_listing = None
                for listing in data:
                    if listing.get("seller_id") != self.buyer_id:
                        suitable_listing = listing
                        break
                
                if suitable_listing:
                    listing_id = suitable_listing.get("id")
                    seller_id = suitable_listing.get("seller_id")
                    self.log_test("Get Listings", True, f"Found {len(data)} listings, using listing_id: {listing_id} from seller: {seller_id}")
                    return listing_id
                else:
                    self.log_test("Get Listings", False, f"Found {len(data)} listings but all belong to the buyer user", data)
                    return None
            else:
                self.log_test("Get Listings", False, "No listings available", data)
                return None
        else:
            self.log_test("Get Listings", False, f"HTTP {response.status_code}", response.json() if response.text else None)
            return None
    
    def test_get_bookstores(self):
        """Test 2: Get available bookstores"""
        print("\n=== Test 2: Get Available Bookstores ===")
        
        response = self.make_request("GET", "/bookstores")
        if not response:
            self.log_test("Get Bookstores", False, "Request failed - connection error")
            return None
            
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                bookstore = data[0]
                bookstore_id = bookstore.get("id")
                self.log_test("Get Bookstores", True, f"Found {len(data)} bookstores, using bookstore_id: {bookstore_id}")
                return bookstore_id
            else:
                self.log_test("Get Bookstores", False, "No bookstores available", data)
                return None
        else:
            self.log_test("Get Bookstores", False, f"HTTP {response.status_code}", response.json() if response.text else None)
            return None
    
    def test_create_order(self, listing_id, bookstore_id):
        """Test 3: Create an order"""
        print("\n=== Test 3: Create Order ===")
        
        if not listing_id or not bookstore_id:
            self.log_test("Create Order", False, "Missing listing_id or bookstore_id")
            return None
            
        payload = {
            "listing_id": listing_id,
            "bookstore_id": bookstore_id
        }
        
        response = self.make_request("POST", f"/orders/create?user_id={self.buyer_id}", json=payload)
        if not response:
            self.log_test("Create Order", False, "Request failed - connection error")
            return None
            
        if response.status_code == 200:
            data = response.json()
            order_id = data.get("order_id")
            status = data.get("status")
            if order_id and status == "pending_payment":
                self.log_test("Create Order", True, f"Order created with ID: {order_id}, status: {status}")
                return order_id
            else:
                self.log_test("Create Order", False, f"Unexpected response format", data)
                return None
        else:
            self.log_test("Create Order", False, f"HTTP {response.status_code}", response.json() if response.text else None)
            return None
    
    def test_pay_order(self, order_id):
        """Test 4: Pay the order (simulated)"""
        print("\n=== Test 4: Pay Order ===")
        
        if not order_id:
            self.log_test("Pay Order", False, "Missing order_id")
            return False
            
        response = self.make_request("POST", f"/orders/{order_id}/pay?user_id={self.buyer_id}")
        if not response:
            self.log_test("Pay Order", False, "Request failed - connection error")
            return False
            
        if response.status_code == 200:
            data = response.json()
            status = data.get("status")
            if status == "paid_escrow":
                self.log_test("Pay Order", True, f"Payment successful, status: {status}")
                return True
            else:
                self.log_test("Pay Order", False, f"Unexpected status: {status}", data)
                return False
        else:
            self.log_test("Pay Order", False, f"HTTP {response.status_code}", response.json() if response.text else None)
            return False
    
    def test_get_user_orders(self):
        """Test 5: Get user orders"""
        print("\n=== Test 5: Get User Orders ===")
        
        response = self.make_request("GET", f"/orders/user/{self.buyer_id}?role=buyer")
        if not response:
            self.log_test("Get User Orders", False, "Request failed - connection error")
            return False
            
        if response.status_code == 200:
            data = response.json()
            orders = data.get("orders", [])
            total = data.get("total", 0)
            if total > 0:
                self.log_test("Get User Orders", True, f"Found {total} orders for buyer")
                return True
            else:
                self.log_test("Get User Orders", False, "No orders found for buyer", data)
                return False
        else:
            self.log_test("Get User Orders", False, f"HTTP {response.status_code}", response.json() if response.text else None)
            return False
    
    def test_get_order_details(self, order_id):
        """Test 6: Get order details"""
        print("\n=== Test 6: Get Order Details ===")
        
        if not order_id:
            self.log_test("Get Order Details", False, "Missing order_id")
            return None
            
        response = self.make_request("GET", f"/orders/{order_id}?user_id={self.buyer_id}")
        if not response:
            self.log_test("Get Order Details", False, "Request failed - connection error")
            return None
            
        if response.status_code == 200:
            data = response.json()
            status = data.get("status")
            status_history = data.get("status_history", [])
            seller_id = data.get("seller_id")
            if status and len(status_history) > 0:
                self.log_test("Get Order Details", True, f"Order details retrieved, status: {status}, history entries: {len(status_history)}")
                return seller_id
            else:
                self.log_test("Get Order Details", False, "Missing status or status_history", data)
                return None
        else:
            self.log_test("Get Order Details", False, f"HTTP {response.status_code}", response.json() if response.text else None)
            return None
    
    def test_seller_delivery_confirmation(self, order_id, seller_id):
        """Test 7: Seller confirms delivery to bookstore"""
        print("\n=== Test 7: Seller Delivery Confirmation ===")
        
        if not order_id or not seller_id:
            self.log_test("Seller Delivery Confirmation", False, "Missing order_id or seller_id")
            return False
            
        response = self.make_request("POST", f"/orders/{order_id}/deliver-to-bookstore?user_id={seller_id}")
        if not response:
            self.log_test("Seller Delivery Confirmation", False, "Request failed - connection error")
            return False
            
        if response.status_code == 200:
            data = response.json()
            status = data.get("status")
            if status == "delivering_to_bookstore":
                self.log_test("Seller Delivery Confirmation", True, f"Delivery confirmed, status: {status}")
                return True
            else:
                self.log_test("Seller Delivery Confirmation", False, f"Unexpected status: {status}", data)
                return False
        else:
            self.log_test("Seller Delivery Confirmation", False, f"HTTP {response.status_code}", response.json() if response.text else None)
            return False
    
    def test_ready_for_pickup(self, order_id):
        """Test 8: Mark order as ready for pickup"""
        print("\n=== Test 8: Ready for Pickup ===")
        
        if not order_id:
            self.log_test("Ready for Pickup", False, "Missing order_id")
            return False
            
        response = self.make_request("POST", f"/orders/{order_id}/ready-for-pickup")
        if not response:
            self.log_test("Ready for Pickup", False, "Request failed - connection error")
            return False
            
        if response.status_code == 200:
            data = response.json()
            status = data.get("status")
            escrow_deadline = data.get("escrow_deadline")
            if status == "ready_for_pickup" and escrow_deadline:
                self.log_test("Ready for Pickup", True, f"Ready for pickup, status: {status}, deadline: {escrow_deadline}")
                return True
            else:
                self.log_test("Ready for Pickup", False, f"Missing status or deadline", data)
                return False
        else:
            self.log_test("Ready for Pickup", False, f"HTTP {response.status_code}", response.json() if response.text else None)
            return False
    
    def test_confirm_pickup(self, order_id):
        """Test 9: Buyer confirms pickup"""
        print("\n=== Test 9: Confirm Pickup ===")
        
        if not order_id:
            self.log_test("Confirm Pickup", False, "Missing order_id")
            return False
            
        response = self.make_request("POST", f"/orders/{order_id}/confirm-pickup?user_id={self.buyer_id}")
        if not response:
            self.log_test("Confirm Pickup", False, "Request failed - connection error")
            return False
            
        if response.status_code == 200:
            data = response.json()
            status = data.get("status")
            if status == "completed":
                self.log_test("Confirm Pickup", True, f"Pickup confirmed, status: {status}")
                return True
            else:
                self.log_test("Confirm Pickup", False, f"Unexpected status: {status}", data)
                return False
        else:
            self.log_test("Confirm Pickup", False, f"HTTP {response.status_code}", response.json() if response.text else None)
            return False
    
    def run_full_test_suite(self):
        """Run the complete escrow payment test flow"""
        print("🚀 Starting Escrow Payment System Test Suite")
        print(f"Base URL: {self.base_url}")
        print(f"Buyer ID: {self.buyer_id}")
        
        # Test 1 & 2: Get prerequisites
        listing_id = self.test_get_listings()
        bookstore_id = self.test_get_bookstores()
        
        if not listing_id or not bookstore_id:
            print("\n❌ Cannot proceed without listings and bookstores")
            return self.generate_summary()
        
        # Test 3: Create order
        order_id = self.test_create_order(listing_id, bookstore_id)
        if not order_id:
            print("\n❌ Cannot proceed without order creation")
            return self.generate_summary()
        
        # Test 4: Pay order
        payment_success = self.test_pay_order(order_id)
        if not payment_success:
            print("\n❌ Cannot proceed without successful payment")
            return self.generate_summary()
        
        # Test 5: Get user orders
        self.test_get_user_orders()
        
        # Test 6: Get order details
        seller_id = self.test_get_order_details(order_id)
        
        # Test 7: Seller delivery confirmation
        if seller_id:
            delivery_success = self.test_seller_delivery_confirmation(order_id, seller_id)
        else:
            print("\n⚠️ Skipping seller delivery test - no seller_id")
            delivery_success = False
        
        # Test 8: Ready for pickup
        if delivery_success:
            pickup_ready = self.test_ready_for_pickup(order_id)
        else:
            print("\n⚠️ Skipping ready for pickup test - delivery not confirmed")
            pickup_ready = False
        
        # Test 9: Confirm pickup
        if pickup_ready:
            self.test_confirm_pickup(order_id)
        else:
            print("\n⚠️ Skipping confirm pickup test - not ready for pickup")
        
        return self.generate_summary()
    
    def generate_summary(self):
        """Generate test summary"""
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%" if total_tests > 0 else "0%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        print("\n✅ PASSED TESTS:")
        for result in self.test_results:
            if result["success"]:
                print(f"  - {result['test']}: {result['details']}")
        
        return {
            "total": total_tests,
            "passed": passed_tests,
            "failed": failed_tests,
            "success_rate": (passed_tests/total_tests*100) if total_tests > 0 else 0,
            "results": self.test_results
        }

if __name__ == "__main__":
    tester = EscrowPaymentTester()
    summary = tester.run_full_test_suite()
    
    # Save results to file
    with open("/app/escrow_test_results.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n📁 Detailed results saved to: /app/escrow_test_results.json")