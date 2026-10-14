"""
Shared palm-recognition pipeline: detector, embedder and in-memory matcher singletons.

ACTIVE EMBEDDER: HOG+PCA (PalmEmbedder), chosen after empirical testing showed cleaner
genuine/impostor separation than a CNN approach on real enrolled data.
"""

import logging
import os
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import EMBEDDING_DIM, HAND_LANDMARKER_MODEL, PALM_PCA_PATH
from app.models import PalmEmbedding
from app.palm.augment import augment_palm_image
from app.palm.detector import PalmDetector, align_palm
from app.palm.embedder import PalmEmbedder
from app.palm.matcher import PalmMatcher

logger = logging.getLogger(__name__)

detector = PalmDetector(model_path=HAND_LANDMARKER_MODEL)
embedder = PalmEmbedder(embedding_dim=EMBEDDING_DIM)
matcher = PalmMatcher()

if os.path.exists(PALM_PCA_PATH):
    try:
        embedder.load(PALM_PCA_PATH)
        logger.info("Loaded PCA projection from %s", PALM_PCA_PATH)
    except Exception as e:
        logger.warning("Could not load PCA file %s: %s", PALM_PCA_PATH, e)


def reload_matcher(db: Session) -> None:
    """(Re)build the in-memory index from every enrolled embedding in the database."""
    matcher.clear()
    count = 0
    for row in db.query(PalmEmbedding).all():
        matcher.add(customer_id=row.customer_id, embedding=np.array(row.vector, dtype=np.float32))
        count += 1
    logger.info("Matcher loaded %d customer palm embeddings into memory.", count)


def read_upload_as_bgr(file_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(file_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Could not decode uploaded image bytes")
    return img


def detect_align_embed(file_bytes: bytes):
    """Full scan pipeline for one frame: detect -> posture -> liveness -> align -> ensemble embedding."""
    frame = read_upload_as_bgr(file_bytes)
    landmarks, handedness, _ = detector.detect_with_meta(frame)
    if landmarks is None:
        raise HTTPException(422, "No hand detected in camera frame")

    is_open, open_msg = detector.is_open_palm(landmarks)
    if not is_open:
        raise HTTPException(422, open_msg)

    is_live, liveness_score, live_msg = detector.verify_liveness(frame, landmarks)
    if not is_live:
        raise HTTPException(422, f"🫀 Liveness Check Failed: {live_msg}")

    aligned = align_palm(frame, landmarks)
    if aligned is None:
        raise HTTPException(422, "Please hold your hand vertically upright inside posture guide")

    # Multi-variant ensemble embedding for accuracy (parallelized via thread pool)
    variants = [aligned] + augment_palm_image(aligned, n_variants=3, seed=42)
    with ThreadPoolExecutor(max_workers=4) as executor:
        var_embeddings = list(executor.map(embedder.embed, variants))

    mean_vec = np.mean(var_embeddings, axis=0)
    norm = np.linalg.norm(mean_vec) or 1.0
    ensemble_embedding = (mean_vec / norm).astype(np.float32)

    return ensemble_embedding, handedness, liveness_score
