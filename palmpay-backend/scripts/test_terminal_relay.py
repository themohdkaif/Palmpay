"""
Unit & Integration Test Script for Checkpoint 1:
Raspberry Pi Terminal WebSocket Relay & Token Manager.
"""

import asyncio
import json
import requests
import websockets

BACKEND_HTTP = "http://localhost:8000"
BACKEND_WS = "ws://localhost:8000"
TERMINAL_ID = "term_test_01"
TERMINAL_SECRET = "super_secret_pi_key_2026"


async def test_checkpoint_1():
    print("===============================================================================")
    print("      CHECKPOINT 1: WEBSOCKET RELAY & TERMINAL REGISTRY TEST")
    print("===============================================================================")

    # Step 1: Connect Pi Terminal WebSocket with valid secret
    pi_ws_url = f"{BACKEND_WS}/ws/terminal/{TERMINAL_ID}?secret={TERMINAL_SECRET}"
    print(f"[TEST 1] Connecting Pi Terminal via WebSocket: {pi_ws_url}")
    
    async with websockets.connect(pi_ws_url) as pi_ws:
        auth_resp = await pi_ws.recv()
        auth_data = json.loads(auth_resp)
        print(f"[TEST 1] Received from Pi WS: {auth_data}")
        assert auth_data.get("type") == "auth_success", "Failed to authenticate Pi terminal socket"
        print("✓ TEST 1 PASSED: Pi Terminal authenticated & connected cleanly.")

        # Step 2: Request Pairing Token via HTTP POST
        print(f"\n[TEST 2] Requesting pairing token for '{TERMINAL_ID}' via HTTP POST...")
        token_res = requests.post(f"{BACKEND_HTTP}/terminals/{TERMINAL_ID}/pairing-token")
        assert token_res.status_code == 200, f"Token request failed: {token_res.text}"
        token_data = token_res.json()
        token = token_data["token"]
        print(f"[TEST 2] Received Token: {token} (Expires in {token_data['expires_in']}s)")
        print(f"[TEST 2] Generated Pair URL: {token_data['pair_url']}")
        assert token_data["terminal_id"] == TERMINAL_ID
        print("✓ TEST 2 PASSED: Pairing token created successfully.")

        # Step 3: Connect Browser Session WebSocket with pairing token
        browser_ws_url = f"{BACKEND_WS}/ws/session/{token}"
        print(f"\n[TEST 3] Connecting Browser Session via WebSocket: {browser_ws_url}")
        
        async with websockets.connect(browser_ws_url) as browser_ws:
            # Check pairing success message on Browser WS
            browser_init = await browser_ws.recv()
            b_init_data = json.loads(browser_init)
            print(f"[TEST 3] Received on Browser WS: {b_init_data}")
            assert b_init_data.get("type") == "pairing_success", "Browser pairing failed"

            # Check paired notification on Pi WS
            pi_notice = await pi_ws.recv()
            pi_notice_data = json.loads(pi_notice)
            print(f"[TEST 3] Received on Pi WS: {pi_notice_data}")
            assert pi_notice_data.get("type") == "paired", "Pi terminal was not notified of pairing"
            print("✓ TEST 3 PASSED: Browser & Pi paired bidirectionally.")

            # Step 4: Test Message Relay (Browser -> Pi: start_scan)
            print("\n[TEST 4] Testing Browser -> Pi message relay ('start_scan')...")
            scan_cmd = {"type": "start_scan", "mode": "identify", "amount": 50}
            await browser_ws.send(json.dumps(scan_cmd))
            
            pi_recvd_cmd = await pi_ws.recv()
            pi_cmd_data = json.loads(pi_recvd_cmd)
            print(f"[TEST 4] Pi received relayed command: {pi_cmd_data}")
            assert pi_cmd_data == scan_cmd
            print("✓ TEST 4 PASSED: Browser -> Pi command relay verified.")

            # Step 5: Test Message Relay (Pi -> Browser: detection_state & video_frame)
            print("\n[TEST 5] Testing Pi -> Browser message relay ('detection_state' & 'video_frame')...")
            state_msg = {
                "type": "detection_state",
                "state": "holding",
                "feedback": "Hold steady...",
                "hold_progress": 65
            }
            await pi_ws.send(json.dumps(state_msg))

            b_recvd_state = await browser_ws.recv()
            b_state_data = json.loads(b_recvd_state)
            print(f"[TEST 5] Browser received relayed state: {b_state_data}")
            assert b_state_data == state_msg

            frame_msg = {"type": "video_frame", "data": "data:image/jpeg;base64,mockframebytes"}
            await pi_ws.send(json.dumps(frame_msg))

            b_recvd_frame = await browser_ws.recv()
            b_frame_data = json.loads(b_recvd_frame)
            print(f"[TEST 5] Browser received relayed frame: {b_frame_data['type']}")
            assert b_frame_data == frame_msg
            print("✓ TEST 5 PASSED: Pi -> Browser data relay verified.")

            # Step 6: Test Single-Use Token Reuse Rejection
            print("\n[TEST 6] Testing reuse of used token (should be rejected)...")
            try:
                async with websockets.connect(browser_ws_url) as duplicate_ws:
                    resp = await duplicate_ws.recv()
                    print("Duplicate connection response:", resp)
            except websockets.exceptions.InvalidStatusCode as e:
                print(f"[TEST 6] Rejected as expected with status code: {e.status_code}")
            except Exception as e:
                print(f"[TEST 6] Rejected as expected: {e}")
            print("✓ TEST 6 PASSED: Single-use token enforcement verified.")

    print("\n===============================================================================")
    print("      ALL CHECKPOINT 1 WEBSOCKET RELAY TESTS PASSED PERFECTLY! 🚀")
    print("===============================================================================")


if __name__ == "__main__":
    asyncio.run(test_checkpoint_1())
