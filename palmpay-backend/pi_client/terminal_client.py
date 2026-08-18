"""
===============================================================================
PALMPAY RASPBERRY PI STANDALONE TERMINAL CLIENT
===============================================================================

Runs directly on Raspberry Pi (or dev PC) attached to a camera module or USB webcam.

Capabilities:
1. Connects to PalmPay FastAPI WebSocket hub with static TERMINAL_SECRET authentication.
2. Streams downsampled preview frames (~640px, quality ~60) at 10-15 FPS.
3. Runs MediaPipe Python API hand landmark detection locally on full-res frames.
4. Translates centering, size bounds, and 700ms hold timer logic to Python.
5. Sends `detection_state` messages to browser and `capture_complete` multi-frame payload.
6. Auto-pauses detection after capture until explicit `start_scan` command to prevent repeat captures.
===============================================================================
"""

import os
import sys
import time
import base64
import json
import asyncio
from typing import Optional, List, Dict, Any
import cv2
import numpy as np
import websockets
from dotenv import load_dotenv

# Load local environment or default parameters
load_dotenv()

TERMINAL_ID = os.getenv("TERMINAL_ID", "term_pi_01")
TERMINAL_SECRET = os.getenv("TERMINAL_SECRET", "super_secret_pi_key_2026")
BACKEND_WS_URL = os.getenv("BACKEND_WS_URL", "ws://localhost:8000")
CAMERA_TYPE = os.getenv("CAMERA_TYPE", "opencv").lower()
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
PREVIEW_FPS = float(os.getenv("PREVIEW_FPS", "12"))
HOLD_DURATION_MS = float(os.getenv("HOLD_DURATION_MS", "700"))
MODEL_PATH = os.getenv("HAND_LANDMARKER_MODEL", "hand_landmarker.task")


class PiCameraWrapper:
    """Wrapper for either OpenCV VideoCapture or Raspberry Pi Camera Module 3 (picamera2)."""

    def __init__(self, camera_type: str = "opencv", camera_index: int = 0):
        self.camera_type = camera_type
        self.camera_index = camera_index
        self.cap = None
        self.picam2 = None

    def start(self):
        if self.camera_type == "picamera2":
            try:
                from picamera2 import Picamera2
                self.picam2 = Picamera2()
                config = self.picam2.create_preview_configuration(main={"size": (1280, 720), "format": "RGB888"})
                self.picam2.configure(config)
                self.picam2.start()
                print("[CAMERA] PiCamera2 started successfully (1280x720 RGB).")
                return
            except Exception as e:
                print(f"[CAMERA WARNING] Failed to initialize Picamera2 ({e}). Falling back to OpenCV.")
                self.camera_type = "opencv"

        # Default OpenCV VideoCapture
        self.cap = cv2.VideoCapture(self.camera_index)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        if not self.cap.isOpened():
            print(f"[CAMERA WARNING] Could not open OpenCV camera index {self.camera_index}. Simulation mode enabled.")
        else:
            print(f"[CAMERA] OpenCV VideoCapture opened successfully on index {self.camera_index}.")

    def read_frame(self) -> Optional[np.ndarray]:
        """Returns full-res BGR frame."""
        if self.camera_type == "picamera2" and self.picam2:
            rgb_frame = self.picam2.capture_array()
            if rgb_frame is not None:
                return cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2BGR)
            return None
        elif self.cap and self.cap.isOpened():
            ret, frame = self.cap.read()
            if ret:
                return frame
        return None

    def release(self):
        if self.picam2:
            try:
                self.picam2.stop()
            except Exception:
                pass
        if self.cap:
            self.cap.release()


class HandDetectorWrapper:
    """Wrapper for MediaPipe HandLandmarker Tasks API with fallback."""

    def __init__(self, model_path: str = "hand_landmarker.task"):
        self.mp = None
        self.landmarker = None
        try:
            import mediapipe as mp
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision

            if os.path.exists(model_path):
                base_options = mp_python.BaseOptions(model_asset_path=model_path)
                options = vision.HandLandmarkerOptions(
                    base_options=base_options,
                    num_hands=1,
                    min_hand_detection_confidence=0.5,
                    min_hand_presence_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                self.mp = mp
                self.landmarker = vision.HandLandmarker.create_from_options(options)
                print(f"[DETECTOR] MediaPipe HandLandmarker initialized using '{model_path}'.")
            else:
                print(f"[DETECTOR WARNING] '{model_path}' not found. Hand detection running in fallback mode.")
        except Exception as e:
            print(f"[DETECTOR WARNING] MediaPipe init error: {e}")

    def detect_landmarks(self, frame_bgr: np.ndarray):
        """Returns list of normalized (x, y) coordinates or None."""
        if not self.landmarker or not self.mp:
            return None

        try:
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            mp_image = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=frame_rgb)
            result = self.landmarker.detect(mp_image)
            if result and result.hand_landmarks and len(result.hand_landmarks) > 0:
                return [(lm.x, lm.y) for lm in result.hand_landmarks[0]]
        except Exception as e:
            print(f"[DETECTOR ERROR] {e}")
        return None


class TerminalClient:
    def __init__(self):
        self.camera = PiCameraWrapper(camera_type=CAMERA_TYPE, camera_index=CAMERA_INDEX)
        self.detector = HandDetectorWrapper(model_path=MODEL_PATH)
        self.websocket = None

        # State Machine Flags
        self.is_active_scan = False
        self.scan_mode = "identify"
        self.hold_start_time = None
        self.is_triggered = False

    def encode_frame_to_base64(self, frame: np.ndarray, quality: int = 60, width: int = 640) -> str:
        """Helper to resize frame and encode to JPEG base64 string."""
        h, w = frame.shape[:2]
        if w > width:
            new_h = int(h * (width / w))
            resized = cv2.resize(frame, (width, new_h), interpolation=cv2.INTER_AREA)
        else:
            resized = frame

        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        _, buffer = cv2.imencode(".jpg", resized, encode_param)
        b64_str = base64.b64encode(buffer).decode("utf-8")
        return f"data:image/jpeg;base64,{b64_str}"

    async def connect_and_run(self):
        self.camera.start()
        backoff_sec = 1.0

        while True:
            ws_url = f"{BACKEND_WS_URL}/ws/terminal/{TERMINAL_ID}?secret={TERMINAL_SECRET}"
            print(f"[PI CLIENT] Connecting to backend WebSocket: {ws_url}")

            try:
                async with websockets.connect(ws_url) as ws:
                    self.websocket = ws
                    backoff_sec = 1.0  # Reset backoff on success
                    print(f"[PI CLIENT] Connected to backend as terminal '{TERMINAL_ID}'.")

                    # Read initial auth response
                    init_resp = await ws.recv()
                    print(f"[PI CLIENT] Auth Response: {init_resp}")

                    # Spawn concurrent frame streaming & receiver tasks
                    receiver_task = asyncio.create_task(self.receive_messages(ws))
                    stream_task = asyncio.create_task(self.stream_loop(ws))

                    done, pending = await asyncio.wait(
                        [receiver_task, stream_task],
                        return_when=asyncio.FIRST_COMPLETED,
                    )

                    for task in pending:
                        task.cancel()

            except (websockets.exceptions.ConnectionClosed, OSError, Exception) as e:
                print(f"[PI CLIENT WARNING] Connection error: {e}. Reconnecting in {backoff_sec:.1f}s...")
                await asyncio.sleep(backoff_sec)
                backoff_sec = min(30.0, backoff_sec * 1.5)

    async def receive_messages(self, ws):
        """Listens for commands from Browser via Backend Relay (start_scan, cancel)."""
        async for raw_msg in ws:
            try:
                msg = json.loads(raw_msg)
                msg_type = msg.get("type")

                if msg_type == "start_scan":
                    self.is_active_scan = True
                    self.scan_mode = msg.get("mode", "identify")
                    self.hold_start_time = None
                    self.is_triggered = False
                    print(f"[PI CLIENT] Started scan mode: '{self.scan_mode}'. Detection enabled.")

                elif msg_type == "cancel":
                    self.is_active_scan = False
                    self.hold_start_time = None
                    self.is_triggered = False
                    print("[PI CLIENT] Scan cancelled by user/browser. Detection paused.")

                elif msg_type == "paired":
                    print(f"[PI CLIENT] Browser paired! Token: {msg.get('token')}")

                elif msg_type == "unpaired":
                    self.is_active_scan = False
                    print("[PI CLIENT] Browser unpaired. Resetting terminal state.")

            except Exception as err:
                print(f"[PI CLIENT ERROR] Message parsing failed: {err}")

    async def stream_loop(self, ws):
        """Continuously captures camera frames, runs detection if active, and streams preview."""
        frame_interval = 1.0 / PREVIEW_FPS

        while True:
            t_start = time.time()
            frame = self.camera.read_frame()

            if frame is None:
                # Generate synthetic test frame if no physical camera present
                frame = np.zeros((720, 1280, 3), dtype=np.uint8)
                cv2.putText(frame, "PalmPay Remote Pi Camera Feed (Simulation)", (50, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
                cv2.circle(frame, (640, 360), 180, (180, 140, 70), -1)

            # 1. Always stream preview frame to paired browser at ~12 FPS
            preview_b64 = self.encode_frame_to_base64(frame, quality=60, width=640)
            try:
                await ws.send(json.dumps({"type": "video_frame", "data": preview_b64}))
            except Exception:
                break

            # 2. Run local MediaPipe hand detection ONLY while start_scan is active
            if self.is_active_scan and not self.is_triggered:
                landmarks = self.detector.detect_landmarks(frame)

                if landmarks:
                    x_coords = [pt[0] for pt in landmarks]
                    y_coords = [pt[1] for pt in landmarks]
                    min_x, max_x = min(x_coords), max(x_coords)
                    min_y, max_y = min(y_coords), max(y_coords)

                    center_x = (min_x + max_x) / 2.0
                    center_y = (min_y + max_y) / 2.0
                    width = max_x - min_x
                    height = max_y - min_y

                    # Check centering & size limits (identical to useHandDetection.ts)
                    is_centered = (0.25 <= center_x <= 0.75) and (0.20 <= center_y <= 0.80)
                    is_good_size = (0.22 <= width <= 0.85) and (0.25 <= height <= 0.90)

                    if not is_centered or not is_good_size:
                        self.hold_start_time = None
                        feedback = "Center palm in viewfinder"
                        if center_x < 0.25:
                            feedback = "Move palm right →"
                        elif center_x > 0.75:
                            feedback = "Move palm left ←"
                        elif width < 0.22:
                            feedback = "Move palm closer"
                        elif width > 0.85:
                            feedback = "Move palm back"

                        state_msg = {
                            "type": "detection_state",
                            "state": "positioning",
                            "feedback": feedback,
                            "hold_progress": 0,
                        }
                        await ws.send(json.dumps(state_msg))
                    else:
                        now_ms = time.time() * 1000.0
                        if self.hold_start_time is None:
                            self.hold_start_time = now_ms

                        elapsed_ms = now_ms - self.hold_start_time
                        progress = min(100, int((elapsed_ms / HOLD_DURATION_MS) * 100.0))

                        state_msg = {
                            "type": "detection_state",
                            "state": "holding",
                            "feedback": "Hold steady...",
                            "hold_progress": progress,
                        }
                        await ws.send(json.dumps(state_msg))

                        # Auto-trigger capture on complete hold
                        if elapsed_ms >= HOLD_DURATION_MS and not self.is_triggered:
                            self.is_triggered = True
                            print("[PI CLIENT] Hold complete! Capturing multi-frame payload...")

                            await ws.send(json.dumps({
                                "type": "detection_state",
                                "state": "captured",
                                "feedback": "Captured!",
                                "hold_progress": 100,
                            }))

                            # Capture 3 full-res frames 150ms apart for anti-spoofing liveness
                            captured_b64_frames = []
                            for i in range(3):
                                cap_frame = self.camera.read_frame()
                                if cap_frame is None:
                                    cap_frame = frame
                                cap_b64 = self.encode_frame_to_base64(cap_frame, quality=90, width=1280)
                                captured_b64_frames.append(cap_b64)
                                await asyncio.sleep(0.15)

                            # Send capture_complete message
                            complete_msg = {
                                "type": "capture_complete",
                                "frames": captured_b64_frames,
                                "mode": self.scan_mode,
                            }
                            await ws.send(json.dumps(complete_msg))
                            print("[PI CLIENT] `capture_complete` payload transmitted successfully.")

                            # PAUSE DETECTION to prevent repeat auto-captures until next start_scan
                            self.is_active_scan = False
                            self.hold_start_time = None
                else:
                    self.hold_start_time = None
                    state_msg = {
                        "type": "detection_state",
                        "state": "none",
                        "feedback": "Position palm over scanner",
                        "hold_progress": 0,
                    }
                    await ws.send(json.dumps(state_msg))

            # Maintain preview target FPS
            elapsed = time.time() - t_start
            sleep_time = max(0.001, frame_interval - elapsed)
            await asyncio.sleep(sleep_time)


def main():
    print("===============================================================================")
    print("      PALMPAY RASPBERRY PI STANDALONE TERMINAL CLIENT STARTING")
    print("===============================================================================")
    print(f"  Terminal ID:     {TERMINAL_ID}")
    print(f"  Backend WS URL:  {BACKEND_WS_URL}")
    print(f"  Camera Type:     {CAMERA_TYPE}")
    print(f"  Target FPS:      {PREVIEW_FPS}")
    print("===============================================================================")

    client = TerminalClient()
    try:
        asyncio.run(client.connect_and_run())
    except KeyboardInterrupt:
        print("\n[PI CLIENT] Stopped by user.")
        client.camera.release()


if __name__ == "__main__":
    main()
