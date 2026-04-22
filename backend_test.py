#!/usr/bin/env python3
"""
Backend Testing for ScambiaLibri - Chat/Conversation System APIs
Testing the new Chat/Conversation System APIs:
1. Create/Get Conversation (POST /api/conversations)
2. Get User Conversations (GET /api/conversations/{user_id})
3. Get Conversation Detail (GET /api/conversations/detail/{conversation_id})
4. Send Message (POST /api/conversations/{conversation_id}/messages)
5. Get Messages (GET /api/conversations/{conversation_id}/messages)
6. Mark as Read (POST /api/conversations/{conversation_id}/read)
"""

import requests
import json
import sys
import os
from datetime import datetime

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://language-check-10.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials from review request
TEST_EMAIL = "carco83@gmail.com"
TEST_PASSWORD = "admin2024"

# Test user IDs from review request
BUYER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"
SELLER_ID = "58ac430d-da2a-4954-bb2f-feea6de1f30c"  # Use same user for initial testing
LISTING_ID = "25352340-97e6-4db8-bcbd-4a2590de3330"
BOOK_ISBN = "9788863085495"
BOOK_TITLE = "DESIGN. MANUALI D'ARTE"

class TestResults:
    def __init__(self):
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.results = []
        self.conversation_id = None  # Store conversation ID for subsequent tests
    
    def add_result(self, test_name, passed, details=""):
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
            status = "✅ PASS"
        else:
            self.failed_tests += 1
            status = "❌ FAIL"
        
        result = f"{status} - {test_name}"
        if details:
            result += f" | {details}"
        
        self.results.append(result)
        print(result)
    
    def print_summary(self):
        print(f"\n{'='*60}")
        print(f"CHAT SYSTEM TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {self.total_tests}")
        print(f"Passed: {self.passed_tests}")
        print(f"Failed: {self.failed_tests}")
        print(f"Success Rate: {(self.passed_tests/self.total_tests*100):.1f}%")
        print(f"{'='*60}")

def create_test_seller():
    """Create a test seller user for testing"""
    print(f"\n👤 Creating test seller user")
    
    register_url = f"{API_BASE}/auth/register"
    register_data = {
        "email": "test.seller@example.com",
        "password": "testpass123",
        "nome": "Test",
        "cognome": "Seller"
    }
    
    try:
        response = requests.post(register_url, json=register_data, timeout=30)
        
        if response.status_code not in [200, 201]:
            # User might already exist, try to login
            login_url = f"{API_BASE}/auth/login"
            login_data = {
                "email": "test.seller@example.com",
                "password": "testpass123"
            }
            
            login_response = requests.post(login_url, json=login_data, timeout=30)
            if login_response.status_code == 200:
                data = login_response.json()
                seller_id = data.get("user_id")
                if seller_id:
                    print(f"✅ Test seller login successful. User ID: {seller_id}")
                    return seller_id
            
            print(f"❌ Failed to create/login test seller: HTTP {response.status_code}: {response.text}")
            return None
        
        data = response.json()
        seller_id = data.get("user_id")
        
        if seller_id:
            print(f"✅ Test seller created successfully. User ID: {seller_id}")
            return seller_id
        else:
            print(f"❌ Registration response missing user ID: {data}")
            return None
            
    except Exception as e:
        print(f"❌ Test seller creation error: {str(e)}")
        return None

def login_user():
    """Login user to get authentication token"""
    print(f"\n🔐 Logging in as {TEST_EMAIL}")
    
    login_url = f"{API_BASE}/auth/login"
    login_data = {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    }
    
    try:
        response = requests.post(login_url, json=login_data, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ Login failed: HTTP {response.status_code}: {response.text}")
            return None
        
        data = response.json()
        user_id = data.get("user_id")
        
        if user_id:
            print(f"✅ Login successful. User ID: {user_id}")
            return user_id
        else:
            print(f"❌ Login response missing user ID: {data}")
            return None
            
    except Exception as e:
        print(f"❌ Login error: {str(e)}")
        return None
    """Login user to get authentication token"""
    print(f"\n🔐 Logging in as {TEST_EMAIL}")
    
    login_url = f"{API_BASE}/auth/login"
    login_data = {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    }
    
    try:
        response = requests.post(login_url, json=login_data, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ Login failed: HTTP {response.status_code}: {response.text}")
            return None
        
        data = response.json()
        user_id = data.get("user_id")
        
        if user_id:
            print(f"✅ Login successful. User ID: {user_id}")
            return user_id
        else:
            print(f"❌ Login response missing user ID: {data}")
            return None
            
    except Exception as e:
        print(f"❌ Login error: {str(e)}")
        return None

def test_create_conversation(results):
    """Test 1: Create/Get Conversation (POST /api/conversations)"""
    print(f"\n🔍 TEST 1: Create/Get Conversation")
    
    url = f"{API_BASE}/conversations"
    conversation_data = {
        "buyer_id": BUYER_ID,
        "seller_id": SELLER_ID,
        "listing_id": LISTING_ID,
        "book_isbn": BOOK_ISBN,
        "book_title": BOOK_TITLE
    }
    
    try:
        response = requests.post(url, json=conversation_data, timeout=30)
        
        if response.status_code not in [200, 201]:
            return False, f"HTTP {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check required fields
        required_fields = ["id", "buyer_id", "seller_id", "listing_id", "book_isbn", "book_title", "buyer_username", "seller_username"]
        missing_fields = []
        
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
        
        if missing_fields:
            return False, f"Missing fields: {missing_fields}"
        
        # Verify data matches input
        if data["buyer_id"] != BUYER_ID:
            return False, f"buyer_id mismatch: expected {BUYER_ID}, got {data['buyer_id']}"
        
        if data["seller_id"] != SELLER_ID:
            return False, f"seller_id mismatch: expected {SELLER_ID}, got {data['seller_id']}"
        
        if data["listing_id"] != LISTING_ID:
            return False, f"listing_id mismatch: expected {LISTING_ID}, got {data['listing_id']}"
        
        if data["book_isbn"] != BOOK_ISBN:
            return False, f"book_isbn mismatch: expected {BOOK_ISBN}, got {data['book_isbn']}"
        
        # Store conversation ID for subsequent tests
        results.conversation_id = data["id"]
        
        details = f"Conversation created with ID: {data['id']}, buyer: {data['buyer_username']}, seller: {data['seller_username']}"
        return True, details
        
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON response: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

def test_get_user_conversations(results):
    """Test 2: Get User Conversations (GET /api/conversations/{user_id})"""
    print(f"\n🔍 TEST 2: Get User Conversations")
    
    url = f"{API_BASE}/conversations/{BUYER_ID}"
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check response structure
        if "conversations" not in data:
            return False, "Missing 'conversations' field in response"
        
        conversations = data["conversations"]
        
        if not isinstance(conversations, list):
            return False, "conversations should be a list"
        
        if len(conversations) == 0:
            return False, "No conversations found for user"
        
        # Check if our conversation is in the list
        conversation_found = False
        for conv in conversations:
            if conv.get("id") == results.conversation_id:
                conversation_found = True
                
                # Check required fields
                required_fields = ["id", "buyer_id", "seller_id", "listing_id", "book_isbn", "book_title", "unread_count"]
                missing_fields = []
                
                for field in required_fields:
                    if field not in conv:
                        missing_fields.append(field)
                
                if missing_fields:
                    return False, f"Missing fields in conversation: {missing_fields}"
                
                # Check unread_count is a number
                if not isinstance(conv["unread_count"], (int, float)):
                    return False, f"unread_count should be a number, got {type(conv['unread_count'])}"
                
                break
        
        if not conversation_found:
            return False, f"Created conversation {results.conversation_id} not found in user conversations"
        
        details = f"Found {len(conversations)} conversations, unread_count: {conv['unread_count']}"
        return True, details
        
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON response: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

def test_get_conversation_detail(results):
    """Test 3: Get Conversation Detail (GET /api/conversations/detail/{conversation_id})"""
    print(f"\n🔍 TEST 3: Get Conversation Detail")
    
    if not results.conversation_id:
        return False, "No conversation ID available from previous test"
    
    url = f"{API_BASE}/conversations/detail/{results.conversation_id}"
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check required fields
        required_fields = ["id", "buyer_id", "seller_id", "listing_id", "book_isbn", "book_title", "buyer_username", "seller_username", "created_at"]
        missing_fields = []
        
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
        
        if missing_fields:
            return False, f"Missing fields: {missing_fields}"
        
        # Verify this is our conversation
        if data["id"] != results.conversation_id:
            return False, f"Conversation ID mismatch: expected {results.conversation_id}, got {data['id']}"
        
        details = f"Conversation detail retrieved: {data['book_title']} between {data['buyer_username']} and {data['seller_username']}"
        return True, details
        
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON response: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

def test_send_message(results):
    """Test 4: Send Message (POST /api/conversations/{conversation_id}/messages)"""
    print(f"\n🔍 TEST 4: Send Message")
    
    if not results.conversation_id:
        return False, "No conversation ID available from previous test"
    
    url = f"{API_BASE}/conversations/{results.conversation_id}/messages"
    message_data = {
        "sender_id": BUYER_ID,
        "content": "I fascicoli ci sono tutti?"
    }
    
    try:
        response = requests.post(url, json=message_data, timeout=30)
        
        if response.status_code not in [200, 201]:
            return False, f"HTTP {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check response structure
        if "message" not in data:
            return False, "Missing 'message' field in response"
        
        message = data["message"]
        
        # Check required fields
        required_fields = ["id", "conversation_id", "sender_id", "sender_username", "content", "read", "created_at"]
        missing_fields = []
        
        for field in required_fields:
            if field not in message:
                missing_fields.append(field)
        
        if missing_fields:
            return False, f"Missing fields in message: {missing_fields}"
        
        # Verify message data
        if message["conversation_id"] != results.conversation_id:
            return False, f"conversation_id mismatch: expected {results.conversation_id}, got {message['conversation_id']}"
        
        if message["sender_id"] != BUYER_ID:
            return False, f"sender_id mismatch: expected {BUYER_ID}, got {message['sender_id']}"
        
        if message["content"] != "I fascicoli ci sono tutti?":
            return False, f"content mismatch: expected 'I fascicoli ci sono tutti?', got '{message['content']}'"
        
        if message["read"] != False:
            return False, f"read should be False for new message, got {message['read']}"
        
        details = f"Message sent: '{message['content']}' by {message['sender_username']}"
        return True, details
        
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON response: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

def test_get_messages(results):
    """Test 5: Get Messages (GET /api/conversations/{conversation_id}/messages)"""
    print(f"\n🔍 TEST 5: Get Messages")
    
    if not results.conversation_id:
        return False, "No conversation ID available from previous test"
    
    url = f"{API_BASE}/conversations/{results.conversation_id}/messages"
    
    try:
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check response structure
        if "messages" not in data:
            return False, "Missing 'messages' field in response"
        
        messages = data["messages"]
        
        if not isinstance(messages, list):
            return False, "messages should be a list"
        
        if len(messages) == 0:
            return False, "No messages found in conversation"
        
        # Check if our message is in the list
        message_found = False
        for msg in messages:
            if msg.get("content") == "I fascicoli ci sono tutti?":
                message_found = True
                
                # Check required fields
                required_fields = ["id", "conversation_id", "sender_id", "sender_username", "content", "read", "created_at"]
                missing_fields = []
                
                for field in required_fields:
                    if field not in msg:
                        missing_fields.append(field)
                
                if missing_fields:
                    return False, f"Missing fields in message: {missing_fields}"
                
                break
        
        if not message_found:
            return False, "Sent message not found in conversation messages"
        
        # Check if messages are sorted by created_at (should be ascending)
        if len(messages) > 1:
            for i in range(1, len(messages)):
                if messages[i]["created_at"] < messages[i-1]["created_at"]:
                    return False, "Messages are not sorted by created_at in ascending order"
        
        details = f"Retrieved {len(messages)} messages, sorted by created_at"
        return True, details
        
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON response: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

def test_mark_as_read(results):
    """Test 6: Mark as Read (POST /api/conversations/{conversation_id}/read)"""
    print(f"\n🔍 TEST 6: Mark as Read")
    
    if not results.conversation_id:
        return False, "No conversation ID available from previous test"
    
    url = f"{API_BASE}/conversations/{results.conversation_id}/read"
    read_data = {
        "user_id": SELLER_ID  # Seller marking buyer's message as read
    }
    
    try:
        response = requests.post(url, json=read_data, timeout=30)
        
        if response.status_code not in [200, 201]:
            return False, f"HTTP {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check response structure
        if "marked_read" not in data:
            return False, "Missing 'marked_read' field in response"
        
        marked_read = data["marked_read"]
        
        if not isinstance(marked_read, (int, float)):
            return False, f"marked_read should be a number, got {type(marked_read)}"
        
        # Should have marked at least 1 message as read
        if marked_read < 1:
            return False, f"Expected at least 1 message to be marked as read, got {marked_read}"
        
        details = f"Marked {marked_read} messages as read"
        return True, details
        
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON response: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"

def main():
    """Run all chat system tests"""
    print("🚀 Starting ScambiaLibri Backend Testing - Chat/Conversation System APIs")
    print(f"Backend URL: {API_BASE}")
    print(f"Test Email: {TEST_EMAIL}")
    print(f"Buyer ID: {BUYER_ID}")
    print(f"Listing ID: {LISTING_ID}")
    print(f"Book ISBN: {BOOK_ISBN}")
    print(f"Book Title: {BOOK_TITLE}")
    
    # Login first to verify credentials
    user_id = login_user()
    if not user_id:
        print("❌ Login failed. Cannot proceed with tests.")
        return 1
    
    # Create a test seller
    seller_id = create_test_seller()
    if not seller_id:
        print("❌ Failed to create test seller. Cannot proceed with tests.")
        return 1
    
    # Update global SELLER_ID for tests
    global SELLER_ID
    SELLER_ID = seller_id
    print(f"Seller ID: {SELLER_ID}")
    
    results = TestResults()
    
    # Test 1: Create/Get Conversation
    passed, details = test_create_conversation(results)
    results.add_result("Create/Get Conversation", passed, details)
    
    # Test 2: Get User Conversations
    passed, details = test_get_user_conversations(results)
    results.add_result("Get User Conversations", passed, details)
    
    # Test 3: Get Conversation Detail
    passed, details = test_get_conversation_detail(results)
    results.add_result("Get Conversation Detail", passed, details)
    
    # Test 4: Send Message
    passed, details = test_send_message(results)
    results.add_result("Send Message", passed, details)
    
    # Test 5: Get Messages
    passed, details = test_get_messages(results)
    results.add_result("Get Messages", passed, details)
    
    # Test 6: Mark as Read
    passed, details = test_mark_as_read(results)
    results.add_result("Mark as Read", passed, details)
    
    # Print summary
    results.print_summary()
    
    # Return exit code based on results
    return 0 if results.failed_tests == 0 else 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)