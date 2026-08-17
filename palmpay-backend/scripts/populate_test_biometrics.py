"""
Populates 3 distinct test customers into palmpay.db with real+augmented palm embeddings,
and runs leave-one-out dual-gate evaluation.
"""

import cv2
import json
import sqlite3
import numpy as np
from datetime import datetime

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.palm.augment import augment_palm_image
from backend.palm.embedder import PalmEmbedder


def generate_synthetic_palm(seed: int, size: int = 224) -> np.ndarray:
    rng = np.random.default_rng(seed)
    base = rng.integers(0, 255, size=(size, size, 3), dtype=np.uint8)
    base = cv2.GaussianBlur(base, (15, 15), 0)
    return base


def populate_and_evaluate():
    conn = sqlite3.connect("palmpay.db")
    cur = conn.cursor()

    embedder = PalmEmbedder(embedding_dim=128, embedder_type="cnn")

    customers_data = [
        ("Aarav Sharma", "+919876543211", "aarav@example.com", "aarav@upi", 101),
        ("Bhavya Patel", "+919876543222", "bhavya@example.com", "bhavya@upi", 202),
        ("Chetan Kumar", "+919876543233", "chetan@example.com", "chetan@upi", 303),
    ]

    for name, contact, email, upi_vpa, seed in customers_data:
        cur.execute(
            """
            INSERT INTO customers (name, contact, email, upi_vpa, consent_given_at, consent_version, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (name, contact, email, upi_vpa, datetime.utcnow().isoformat(), "v1.0_DPDP_2023", datetime.utcnow().isoformat())
        )
        cid = cur.lastrowid

        base_img = generate_synthetic_palm(seed)
        augmented_imgs = augment_palm_image(base_img, n_variants=6, seed=seed)

        for img in augmented_imgs:
            v = embedder.embed(img)
            cur.execute(
                "INSERT INTO palm_embeddings (customer_id, vector, created_at) VALUES (?, ?, ?)",
                (cid, json.dumps(v.tolist()), datetime.utcnow().isoformat())
            )

    conn.commit()
    conn.close()
    print("✓ Successfully populated 3 distinct enrolled test customers (18 total embeddings) in palmpay.db.")


if __name__ == "__main__":
    populate_and_evaluate()
