"""
Unit & Integration Test Script for Checkpoint 3:
Frontend Pairing & Remote Viewfinder Integration Test.
"""

import asyncio
import json
import requests
import websockets

BACKEND_HTTP = "http://localhost:8000"
BACKEND_WS = "ws://localhost:8000"
TERMINAL_ID = "term_pi_cp3"
TERMINAL_SECRET = "super_secret_pi_key_2026"


async def test_checkpoint_3():
    print("===============================================================================")
    print("      CHECKPOINT 3: FRONTEND QR PAIRING & REMOTE VIEWFINDER TEST")
    print("===============================================================================")

    # 1. Connect Pi Terminal
    pi_url = f"{BACKEND_WS}/ws/terminal/{TERMINAL_ID}?secret={TERMINAL_SECRET}"
    print(f"[CP3 TEST 1] Connecting Pi Terminal '{TERMINAL_ID}'...")
    
    async with websockets.connect(pi_url) as pi_ws:
        init_pi = await pi_ws.recv()
        assert json.loads(init_pi).get("type") == "auth_success"
        print("✓ CP3 TEST 1 PASSED: Pi Terminal authenticated.")

        # 2. Generate Pairing Token via POST
        tok_res = requests.post(f"{BACKEND_HTTP}/terminals/{TERMINAL_ID}/pairing-token")
        assert tok_res.status_code == 200
        tok_data = tok_res.json()
        token = tok_data["token"]
        print(f"[CP3 TEST 2] Generated Pair URL: {tok_data['pair_url']}")
        assert f"/pair?terminal={TERMINAL_ID}&token={token}" in tok_data["pair_url"]
        print("✓ CP3 TEST 2 PASSED: Pair URL generated for QR code scanning.")

        # 3. Simulate Browser Session WS connection (matching app/pair/page.tsx)
        browser_url = f"{BACKEND_WS}/ws/session/{token}"
        print(f"\n[CP3 TEST 3] Simulating Browser connecting to {browser_url}...")
        
        async with websockets.connect(browser_url) as browser_ws:
            b_msg = json.loads(await browser_ws.recv())
            assert b_msg.get("type") == "pairing_success"
            
            p_msg = json.loads(await pi_ws.recv())
            assert p_msg.get("type") == "paired"
            print("✓ CP3 TEST 3 PASSED: Browser & Pi paired.")

            # 4. Simulate Pi streaming detection state & preview frame to browser
            print("\n[CP3 TEST 4] Simulating Pi streaming frames & hold progress...")
            await pi_ws.send(json.dumps({
                "type": "detection_state",
                "state": "holding",
                "feedback": "Hold steady...",
                "hold_progress": 85
            }))

            b_state = json.loads(await browser_ws.recv())
            assert b_state["state"] == "holding"
            assert b_state["hold_progress"] == 85
            print("✓ CP3 TEST 4 PASSED: Remote detection state received by browser.")

    print("\n===============================================================================")
    print("      CHECKPOINT 3 VERIFICATION PASSED PERFECTLY! 🚀")
    print("===============================================================================")


if __name__ == "__main__":
    asyncio.run(test_checkpoint_3())
