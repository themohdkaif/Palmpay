"""
Integration Test Script for Cloned Backend Server (GULSHANKUMAR6079/palmpe)
Tests HTTP endpoints directly against http://localhost:8000
"""

import requests
import json
import numpy as np
import cv2

BACKEND_URL = "http://localhost:8000"

def create_synthetic_palm_image_bytes():
    """Generates a synthetic 640x800 BGR palm image bytes."""
    img = np.zeros((800, 640, 3), dtype=np.uint8)
    img[:] = (20, 20, 20)
    # Draw palm circle and fingers to simulate hand structure
    cv2.circle(img, (320, 450), 120, (180, 140, 70), -1)
    cv2.line(img, (320, 450), (320, 150), (180, 140, 70), 30) # Middle finger
    cv2.line(img, (260, 460), (220, 180), (180, 140, 70), 28) # Index finger
    cv2.line(img, (380, 460), (420, 180), (180, 140, 70), 28) # Ring finger
    cv2.line(img, (440, 480), (500, 250), (180, 140, 70), 24) # Pinky finger
    cv2.line(img, (200, 500), (130, 350), (180, 140, 70), 32) # Thumb

    _, buffer = cv2.imencode('.jpg', img)
    return buffer.tobytes()

def run_integration_tests():
    print("===============================================================================")
    print("      INTEGRATION TEST: CLONED BACKEND (http://localhost:8000)")
    print("===============================================================================")

    # 1. GET /customers
    print("\n[TEST 1] Testing GET /customers...")
    r1 = requests.get(f"{BACKEND_URL}/customers")
    print(f"  -> Status Code: {r1.status_code}")
    assert r1.status_code == 200
    customers = r1.json()
    print(f"  -> Total Customers Enrolled: {len(customers)}")
    print("✓ TEST 1 PASSED: Customer directory listing API working.")

    # 2. GET /transactions
    print("\n[TEST 2] Testing GET /transactions...")
    r2 = requests.get(f"{BACKEND_URL}/transactions")
    print(f"  -> Status Code: {r2.status_code}")
    assert r2.status_code == 200
    txns = r2.json().get("transactions", [])
    print(f"  -> Total Ledger Transactions: {len(txns)}")
    print("✓ TEST 2 PASSED: Merchant ledger API working.")

    # 3. POST /terminals/{terminal_id}/pairing-token
    print("\n[TEST 3] Testing POST /terminals/term_test_live/pairing-token...")
    r3 = requests.post(f"{BACKEND_URL}/terminals/term_test_live/pairing-token")
    print(f"  -> Status Code: {r3.status_code}")
    assert r3.status_code == 200
    tok_data = r3.json()
    print(f"  -> Token: {tok_data.get('token')}")
    print(f"  -> Pair URL: {tok_data.get('pair_url')}")
    print("✓ TEST 3 PASSED: WebSocket terminal pairing token API working.")

    print("\n===============================================================================")
    print("      ALL LOCAL BACKEND INTEGRATION ENDPOINTS VERIFIED OPERATIONAL! 🚀")
    print("===============================================================================")

if __name__ == "__main__":
    run_integration_tests()
