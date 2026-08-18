"""
Diagnostic Script: Decode Base64 Payload & Test Backend Hand Detection Response
"""

import base64
import os
import requests
import cv2
import numpy as np

BACKEND_URL = "http://localhost:8000"

def draw_realistic_palm():
    """Generates an image of a hand with palm and fingers."""
    img = np.ones((800, 640, 3), dtype=np.uint8) * 40
    # Base palm skin tone
    cv2.ellipse(img, (320, 480), (140, 160), 0, 0, 360, (180, 160, 140), -1)
    # Fingers
    cv2.rectangle(img, (200, 180), (250, 360), (180, 160, 140), -1) # Index
    cv2.rectangle(img, (270, 140), (320, 350), (180, 160, 140), -1) # Middle
    cv2.rectangle(img, (340, 160), (390, 360), (180, 160, 140), -1) # Ring
    cv2.rectangle(img, (410, 220), (455, 380), (180, 160, 140), -1) # Pinky
    # Thumb
    cv2.line(img, (200, 480), (120, 380), (180, 160, 140), 45)
    
    _, buf = cv2.imencode('.jpg', img)
    return buf.tobytes()

def test_diagnostics():
    print("===============================================================================")
    print("      DIAGNOSTIC TEST: HAND DETECTION & BASE64 PAYLOAD DECODING")
    print("===============================================================================")

    # 1. Test 0-byte file (corrupted base64)
    print("\n[DIAGNOSTIC 1] Testing 0-byte payload (simulating buggy dataURItoFile)...")
    res1 = requests.post(
        f"{BACKEND_URL}/customers/register",
        data={"name": "Zero Byte Test", "contact": "+911111111111", "email": "zero@test.com", "upi_vpa": "zero@upi"},
        files=[("palm_photos", ("palm.jpg", b"", "image/jpeg"))]
    )
    print("  -> Status:", res1.status_code)
    print("  -> Response Body:", res1.text)

    # 2. Test valid JPEG containing hand drawing
    jpeg_bytes = draw_realistic_palm()
    
    # Save decoded image to scratch/decoded_captured_palm.jpg
    os.makedirs("scratch", exist_ok=True)
    with open("scratch/decoded_captured_palm.jpg", "wb") as f:
        f.write(jpeg_bytes)
    print(f"\n[DIAGNOSTIC 2] Saved decoded image to 'scratch/decoded_captured_palm.jpg' ({len(jpeg_bytes)} bytes).")

    print("\n[DIAGNOSTIC 3] Sending valid JPEG hand image to POST /session/identify...")
    res2 = requests.post(
        f"{BACKEND_URL}/session/identify",
        data={"merchant_id": "Store_01"},
        files=[("palm_photo", ("palm.jpg", jpeg_bytes, "image/jpeg"))]
    )
    print("  -> Status:", res2.status_code)
    print("  -> Response Body:", res2.text)

    print("\n[DIAGNOSTIC 4] Sending valid JPEG hand image to POST /customers/register...")
    res3 = requests.post(
        f"{BACKEND_URL}/customers/register",
        data={"name": "Valid Hand User", "contact": "+919999000011", "email": "validhand@test.com", "upi_vpa": "valid@upi"},
        files=[("palm_photos", ("palm.jpg", jpeg_bytes, "image/jpeg"))]
    )
    print("  -> Status:", res3.status_code)
    print("  -> Response Body:", res3.text)

if __name__ == "__main__":
    test_diagnostics()
