"""
Application settings, read once from environment variables (see backend/.env.example).
Empty values are treated as unset so a freshly copied .env.example falls back to defaults.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, "").strip() or default


def _path(name: str, default: Path) -> str:
    path = Path(_env(name, str(default)))
    return str(path if path.is_absolute() else BACKEND_DIR / path)


# Storage
DATA_DIR = BACKEND_DIR / "data"
DATABASE_URL = _env("DATABASE_URL", f"sqlite:///{DATA_DIR / 'palmpay.db'}")
RECEIPTS_DIR = _path("RECEIPTS_DIR", DATA_DIR / "receipts")

# Model artifacts
HAND_LANDMARKER_MODEL = _path("HAND_LANDMARKER_MODEL", BACKEND_DIR / "assets" / "hand_landmarker.task")
PALM_PCA_PATH = _path("PALM_PCA_PATH", BACKEND_DIR / "assets" / "pca.joblib")

# Biometric matching (cosine similarity thresholds)
EMBEDDING_DIM = 128
TEMPLATES_PER_CUSTOMER = 5
MATCH_THRESHOLD = float(_env("MATCH_THRESHOLD", "0.58"))
VERIFY_THRESHOLD = float(_env("VERIFY_THRESHOLD", "0.58"))

# Payments
PAYMENT_CAP_RUPEES = 100.0
AUTO_APPROVE_MANDATE = _env("AUTO_APPROVE_MANDATE", "true").lower() == "true"
RAZORPAY_KEY_ID = _env("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = _env("RAZORPAY_KEY_SECRET")

# HTTP
CORS_ORIGINS = [o.strip() for o in _env("CORS_ORIGINS", "*").split(",") if o.strip()]
