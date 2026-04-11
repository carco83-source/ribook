#!/usr/bin/env python3
"""
Simple test to debug connection issues
"""

import requests
import json

BASE_URL = "https://language-check-10.preview.emergentagent.com/api"

def test_simple_connection():
    try:
        print("Testing simple GET request...")
        response = requests.get(f"{BASE_URL}/bookstores", timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_bookstore_login():
    try:
        print("Testing bookstore login...")
        response = requests.post(f"{BASE_URL}/bookstore/login?email=test@cartolibreria.it&password=testpassword", timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_registration():
    try:
        print("Testing bookstore registration...")
        payload = {
            "nome_attivita": "Cartolibreria Test Debug",
            "email": "testdebug@cartolibreria.it",
            "partita_iva": "12345678902",
            "indirizzo": "Via Test Debug, 1",
            "citta": "Catanzaro",
            "telefono": "0961999998"
        }
        response = requests.post(f"{BASE_URL}/bookstore/registration-request", json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    print("=== Connection Debug Test ===")
    test_simple_connection()
    print("\n" + "="*40)
    test_bookstore_login()
    print("\n" + "="*40)
    test_registration()