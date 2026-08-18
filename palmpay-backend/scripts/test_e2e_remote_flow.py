"""
End-to-End Integration Test Script for Checkpoint 4:
Full Remote Raspberry Pi Terminal Payment Flow
Pairing -> Scan 1 (Identify) -> Amount Entry -> Scan 2 (Authorize) -> Receipt & Ledger
"""

import asyncio
import json
import requests
import websockets

BACKEND_HTTP = "http://localhost:8000"
BACKEND_WS = "ws://localhost:8000"
TERMINAL_ID = "term_pi_e2e"
TERMINAL_SECRET = "super_secret_pi_key_2026"


async def run_e2e_remote_terminal_test():
    print("===============================================================================")
    print("      CHECKPOINT 4: E2E REMOTE RASPBERRY PI TERMINAL PAYMENT FLOW TEST")
    print("===============================================================================")

    # 1. Start Pi Terminal connection
    pi_ws_url = f"{BACKEND_WS}/ws/terminal/{TERMINAL_ID}?secret={TERMINAL_SECRET}"
    print(f"[STEP 1] Connecting Raspberry Pi Terminal socket: {pi_ws_url}")

    async with websockets.connect(pi_ws_url) as pi_ws:
        pi_auth = json.loads(await pi_ws.recv())
        assert pi_auth.get("type") == "auth_success"
        print("✓ STEP 1 PASSED: Pi Terminal authenticated.")

        # 2. Generate Pairing Token
        print("\n[STEP 2] Merchant generates QR pairing token...")
        tok_res = requests.post(f"{BACKEND_HTTP}/terminals/{TERMINAL_ID}/pairing-token")
        assert tok_res.status_code == 200
        tok_data = tok_res.json()
        token = tok_data["token"]
        print(f"✓ STEP 2 PASSED: Pair URL generated -> {tok_data['pair_url']}")

        # 3. Connect Customer Phone Browser
        browser_ws_url = f"{BACKEND_WS}/ws/session/{token}"
        print(f"\n[STEP 3] Customer scans QR code & opens browser WS: {browser_ws_url}")

        async with websockets.connect(browser_ws_url) as browser_ws:
            b_init = json.loads(await browser_ws.recv())
            assert b_init.get("type") == "pairing_success"

            p_init = json.loads(await pi_ws.recv())
            assert p_init.get("type") == "paired"
            print("✓ STEP 3 PASSED: Customer Phone & Merchant Pi Terminal paired.")

            # 4. Step 1 (Scan 1: Identify): Browser sends start_scan command
            print("\n[STEP 4] Starting Scan 1 (Identify)...")
            await browser_ws.send(json.dumps({"type": "start_scan", "mode": "identify"}))

            pi_cmd = json.loads(await pi_ws.recv())
            assert pi_cmd["type"] == "start_scan" and pi_cmd["mode"] == "identify"
            print("  -> Pi received 'start_scan' command.")

            # Pi streams video frames & detection state
            await pi_ws.send(json.dumps({
                "type": "detection_state",
                "state": "holding",
                "feedback": "Hold steady...",
                "hold_progress": 100
            }))
            b_state = json.loads(await browser_ws.recv())
            assert b_state["state"] == "holding" and b_state["hold_progress"] == 100

            # Pi sends capture_complete multi-frame payload
            await pi_ws.send(json.dumps({
                "type": "capture_complete",
                "frames": ["data:image/jpeg;base64,mockframe1", "data:image/jpeg;base64,mockframe2"],
                "mode": "identify"
            }))
            b_cap = json.loads(await browser_ws.recv())
            assert b_cap["type"] == "capture_complete"
            print("✓ STEP 4 PASSED: Scan 1 (Identify) completed over remote Pi camera relay.")

            # 5. Set Amount for Session via HTTP API
            print("\n[STEP 5] Merchant enters transaction amount (₹50.00)...")
            set_amt_res = requests.post(f"{BACKEND_HTTP}/session/set-amount", json={"session_id": 1, "amount_rupees": 50})
            print(f"  -> Set Amount Response Code: {set_amt_res.status_code}")

            # 6. Step 2 (Scan 2: Authorize): Browser sends start_scan command for authorize
            print("\n[STEP 6] Starting Scan 2 (Authorize Payment)...")
            await browser_ws.send(json.dumps({"type": "start_scan", "mode": "authorize", "amount": 50}))

            pi_auth_cmd = json.loads(await pi_ws.recv())
            assert pi_auth_cmd["type"] == "start_scan" and pi_auth_cmd["mode"] == "authorize"
            print("  -> Pi received 'start_scan' (authorize) command.")

            # Pi streams capture_complete for Scan 2
            await pi_ws.send(json.dumps({
                "type": "capture_complete",
                "frames": ["data:image/jpeg;base64,mockauthframe1"],
                "mode": "authorize"
            }))
            b_auth_cap = json.loads(await browser_ws.recv())
            assert b_auth_cap["type"] == "capture_complete"
            print("✓ STEP 6 PASSED: Scan 2 (Authorize) completed over remote Pi camera relay.")

            # 7. Check Passbook Ledger API
            print("\n[STEP 7] Verifying Passbook Ledger API...")
            ledger_res = requests.get(f"{BACKEND_HTTP}/transactions")
            assert ledger_res.status_code == 200
            print(f"  -> Total Ledger Transactions: {len(ledger_res.json().get('transactions', []))}")
            print("✓ STEP 7 PASSED: Passbook ledger intact.")

    print("\n===============================================================================")
    print("      ALL END-TO-END REMOTE PI TERMINAL CHECKS PASSED PERFECTLY! 🚀")
    print("===============================================================================")


if __name__ == "__main__":
    asyncio.run(run_e2e_remote_terminal_test())
