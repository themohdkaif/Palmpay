"""
===============================================================================
PALMPAY RASPBERRY PI REMOTE TERMINAL WEBSOCKET RELAY PROTOCOL
===============================================================================

Protocol Architecture:
----------------------
1. Raspberry Pi Terminal Client connects to:
   ws://<backend-host>/ws/terminal/{terminal_id}?secret=<TERMINAL_SECRET>
   (or sends authentication JSON message as first message: {"type": "auth", "secret": "<TERMINAL_SECRET>"})

2. Merchant generates pairing QR code via HTTP POST:
   POST /terminals/{terminal_id}/pairing-token
   Returns: {"terminal_id": "...", "token": "...", "pair_url": "...", "expires_in": 120}

3. Customer Phone Browser connects to:
   ws://<backend-host>/ws/session/{pairing_token}

JSON Message Protocol Specs:
-----------------------------
From Pi Terminal -> Backend -> Paired Browser:
  - {"type": "video_frame", "data": "<base64 jpeg>"}
  - {"type": "detection_state", "state": "positioning" | "holding" | "captured" | "none", "feedback": "...", "hold_progress": 0..100}
  - {"type": "capture_complete", "frames": ["<base64>", "<base64>", "<base64>"]}
  - {"type": "terminal_status", "status": "online" | "paired" | "offline"}

From Browser -> Backend -> Paired Pi Terminal:
  - {"type": "start_scan", "mode": "identify" | "authorize", "amount": 50}
  - {"type": "cancel"}

System Messages (Backend -> Browser / Pi):
  - {"type": "pairing_success", "terminal_id": "...", "session_id": "..."}
  - {"type": "error", "message": "..."}
  - {"type": "scan_result", "status": "matched" | "borderline" | "unmatched" | "paid" | "rejected_mismatch", "data": {...}}
===============================================================================
"""

import os
import time
import uuid
import asyncio
from typing import Dict, Optional, Any
from fastapi import WebSocket, WebSocketDisconnect

TOKEN_EXPIRY_SECONDS = 120  # 2 minutes


class TerminalManager:
    def __init__(self):
        # terminal_id -> {"websocket": WebSocket, "status": str, "paired_token": Optional[str]}
        self.terminals: Dict[str, Dict[str, Any]] = {}
        
        # pairing_token -> {"terminal_id": str, "created_at": float, "expires_at": float, "used": bool}
        self.tokens: Dict[str, Dict[str, Any]] = {}
        
        # pairing_token -> WebSocket
        self.browser_sessions: Dict[str, WebSocket] = {}

    def get_expected_secret(self) -> str:
        return os.getenv("TERMINAL_SECRET", "super_secret_pi_key_2026")

    # 1. Terminal Connection Lifecycle
    async def connect_terminal(self, terminal_id: str, websocket: WebSocket, secret: Optional[str]) -> bool:
        expected_secret = self.get_expected_secret()
        if secret != expected_secret:
            await websocket.close(code=4001, reason="Invalid terminal secret")
            return False

        await websocket.accept()
        
        # If terminal already connected, disconnect old socket
        if terminal_id in self.terminals:
            old_ws = self.terminals[terminal_id].get("websocket")
            if old_ws:
                try:
                    await old_ws.close(code=4002, reason="Replaced by new connection")
                except Exception:
                    pass

        self.terminals[terminal_id] = {
            "websocket": websocket,
            "status": "online",
            "paired_token": None,
        }
        
        print(f"[TERMINALS] Terminal '{terminal_id}' connected and authenticated.")
        await websocket.send_json({"type": "auth_success", "terminal_id": terminal_id})
        return True

    async def disconnect_terminal(self, terminal_id: str):
        if terminal_id in self.terminals:
            term_info = self.terminals.pop(terminal_id)
            paired_token = term_info.get("paired_token")
            
            # Notify paired browser if connected
            if paired_token and paired_token in self.browser_sessions:
                browser_ws = self.browser_sessions.get(paired_token)
                if browser_ws:
                    try:
                        await browser_ws.send_json({
                            "type": "error",
                            "message": "Terminal disconnected. Please scan a new QR code."
                        })
                        await browser_ws.close(code=4003, reason="Terminal disconnected")
                    except Exception:
                        pass
                self.browser_sessions.pop(paired_token, None)
                
            print(f"[TERMINALS] Terminal '{terminal_id}' disconnected.")

    # 2. Pairing Token Generation
    def create_pairing_token(self, terminal_id: str, base_url: str = "http://localhost:3000") -> Dict[str, Any]:
        if terminal_id not in self.terminals:
            raise ValueError(f"Terminal '{terminal_id}' is not connected or online.")

        # Invalidate old unused tokens for this terminal
        now = time.time()
        for tok, info in list(self.tokens.items()):
            if info["terminal_id"] == terminal_id and not info["used"]:
                info["used"] = True

        token = str(uuid.uuid4())
        expires_at = now + TOKEN_EXPIRY_SECONDS
        
        self.tokens[token] = {
            "terminal_id": terminal_id,
            "created_at": now,
            "expires_at": expires_at,
            "used": False,
        }

        pair_url = f"{base_url}/pair?terminal={terminal_id}&token={token}"
        return {
            "terminal_id": terminal_id,
            "token": token,
            "pair_url": pair_url,
            "expires_in": TOKEN_EXPIRY_SECONDS,
        }

    # 3. Browser Session Pairing
    async def connect_browser_session(self, pairing_token: str, websocket: WebSocket) -> bool:
        now = time.time()
        token_info = self.tokens.get(pairing_token)

        if not token_info:
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Invalid pairing token."})
            await websocket.close(code=4004, reason="Invalid pairing token")
            return False

        if token_info["used"]:
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "This QR code has already been used. Please generate a new one."})
            await websocket.close(code=4005, reason="Token already used")
            return False

        if now > token_info["expires_at"]:
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "This QR code has expired. Please refresh and scan again."})
            await websocket.close(code=4006, reason="Token expired")
            return False

        terminal_id = token_info["terminal_id"]
        term_data = self.terminals.get(terminal_id)
        if not term_data or not term_data.get("websocket"):
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Target terminal is currently offline."})
            await websocket.close(code=4007, reason="Terminal offline")
            return False

        # Reject if terminal is already paired with an active browser session
        if term_data.get("paired_token") and term_data["paired_token"] in self.browser_sessions:
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Terminal is currently busy with another active session."})
            await websocket.close(code=4008, reason="Terminal busy")
            return False

        # Accept connection and pair
        await websocket.accept()
        token_info["used"] = True
        term_data["status"] = "paired"
        term_data["paired_token"] = pairing_token
        self.browser_sessions[pairing_token] = websocket

        print(f"[TERMINALS] Browser session paired with Terminal '{terminal_id}' using token '{pairing_token}'.")
        
        # Send confirmation to browser
        await websocket.send_json({
            "type": "pairing_success",
            "terminal_id": terminal_id,
            "token": pairing_token,
            "message": "Connected to remote terminal.",
        })

        # Notify Pi terminal of pairing
        pi_ws = term_data["websocket"]
        try:
            await pi_ws.send_json({
                "type": "paired",
                "token": pairing_token,
                "message": "Browser paired successfully.",
            })
        except Exception:
            pass

        return True

    async def disconnect_browser_session(self, pairing_token: str):
        if pairing_token in self.browser_sessions:
            self.browser_sessions.pop(pairing_token)
            
            # Unpair terminal
            token_info = self.tokens.get(pairing_token)
            if token_info:
                terminal_id = token_info["terminal_id"]
                if terminal_id in self.terminals:
                    term_data = self.terminals[terminal_id]
                    if term_data.get("paired_token") == pairing_token:
                        term_data["paired_token"] = None
                        term_data["status"] = "online"
                        
                        # Notify Pi terminal of unpair
                        pi_ws = term_data.get("websocket")
                        if pi_ws:
                            try:
                                await pi_ws.send_json({"type": "unpaired"})
                            except Exception:
                                pass
            print(f"[TERMINALS] Browser session '{pairing_token}' disconnected.")

    # 4. Bidirectional Message Relay
    async def relay_from_pi(self, terminal_id: str, message: Dict[str, Any]) -> Optional[str]:
        """Relays video_frame, detection_state, capture_complete from Pi -> Paired Browser."""
        term_data = self.terminals.get(terminal_id)
        if not term_data:
            return None

        paired_token = term_data.get("paired_token")
        if not paired_token or paired_token not in self.browser_sessions:
            return None

        browser_ws = self.browser_sessions[paired_token]
        try:
            await browser_ws.send_json(message)
            return paired_token
        except Exception as e:
            print(f"[TERMINALS RELAY ERROR] Failed to relay message to browser: {e}")
            return None

    async def relay_from_browser(self, pairing_token: str, message: Dict[str, Any]) -> bool:
        """Relays start_scan, cancel from Browser -> Paired Pi Terminal."""
        token_info = self.tokens.get(pairing_token)
        if not token_info:
            return False

        terminal_id = token_info["terminal_id"]
        term_data = self.terminals.get(terminal_id)
        if not term_data or not term_data.get("websocket"):
            return False

        pi_ws = term_data["websocket"]
        try:
            await pi_ws.send_json(message)
            return True
        except Exception as e:
            print(f"[TERMINALS RELAY ERROR] Failed to relay message to Pi: {e}")
            return False


# Global singleton instance
terminal_manager = TerminalManager()
