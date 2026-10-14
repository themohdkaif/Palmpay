"""Remote terminal (Raspberry Pi) pairing and WebSocket relay hub."""

import uuid
from datetime import datetime
from typing import Any, Dict, Set

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

from app.schemas import PairingTokenResponse

router = APIRouter(tags=["terminals"])

active_pairings: Dict[str, Dict[str, Any]] = {}
active_websockets: Dict[str, Set[WebSocket]] = {}


@router.post("/terminals/{terminal_id}/pairing-token", response_model=PairingTokenResponse)
def create_pairing_token(terminal_id: str, request: Request):
    token = f"pair_{uuid.uuid4().hex[:12]}"
    ws_base = str(request.base_url).rstrip("/").replace("http", "ws", 1)
    active_pairings[token] = {
        "terminal_id": terminal_id,
        "token": token,
        "created_at": datetime.utcnow(),
    }
    return PairingTokenResponse(
        terminal_id=terminal_id,
        token=token,
        pair_url=f"{ws_base}/ws/session/{token}",
        expires_in=300
    )


@router.websocket("/ws/session/{pairing_token}")
async def websocket_relay_endpoint(websocket: WebSocket, pairing_token: str):
    await websocket.accept()
    peers = active_websockets.setdefault(pairing_token, set())
    peers.add(websocket)

    try:
        await websocket.send_json({
            "type": "pairing_success",
            "token": pairing_token,
            "message": "Connected to PalmPay WebSocket Relay Hub"
        })

        while True:
            data = await websocket.receive_json()

            # Broadcast message to all other connected clients on this token
            for ws in list(peers):
                if ws != websocket:
                    try:
                        await ws.send_json(data)
                    except Exception:
                        pass
    except WebSocketDisconnect:
        peers.discard(websocket)
