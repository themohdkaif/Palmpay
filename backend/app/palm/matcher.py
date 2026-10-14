"""
In-memory identity matcher over enrolled palm embeddings (cosine similarity on unit vectors).
"""

import logging
import threading
from typing import List, Optional, Tuple

import numpy as np

from app.config import MATCH_THRESHOLD

logger = logging.getLogger(__name__)


def _unit(embedding: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(embedding) or 1.0
    return (embedding / norm).astype(np.float32)


class PalmMatcher:
    def __init__(self, threshold: float = MATCH_THRESHOLD):
        self.threshold = threshold
        self._embeddings: List[np.ndarray] = []
        self._customer_ids: List[int] = []
        self._lock = threading.Lock()

    def add(self, customer_id: int, embedding: np.ndarray) -> None:
        """Add unit-normalized customer embedding vector to in-memory index."""
        norm_emb = _unit(embedding)
        with self._lock:
            if self._embeddings and self._embeddings[0].shape[0] != norm_emb.shape[0]:
                logger.warning(
                    "Ignoring mismatched %d-D embedding (expected %d-D)",
                    norm_emb.shape[0], self._embeddings[0].shape[0],
                )
                return
            self._embeddings.append(norm_emb)
            self._customer_ids.append(customer_id)

    def clear(self) -> None:
        with self._lock:
            self._embeddings = []
            self._customer_ids = []

    def identify(self, embedding: np.ndarray) -> Tuple[Optional[int], float, str]:
        """
        Identify top match across enrolled customers.
        Returns: (customer_id, confidence_score, status_label)
        status_label: "matched" | "unmatched"
        """
        with self._lock:
            if not self._embeddings:
                return None, 0.0, "unmatched"
            embeddings_matrix = np.stack(self._embeddings)
            customer_ids = list(self._customer_ids)

        query = _unit(embedding)
        if embeddings_matrix.shape[1] != query.shape[0]:
            logger.warning(
                "Query dimension mismatch: index is %d-D, query is %d-D",
                embeddings_matrix.shape[1], query.shape[0],
            )
            return None, 0.0, "unmatched"

        sims = embeddings_matrix @ query
        best_idx = int(np.argmax(sims))
        best_score = float(sims[best_idx])

        if best_score >= self.threshold:
            return customer_ids[best_idx], best_score, "matched"
        return None, best_score, "unmatched"

    def verify(self, customer_id: int, embedding: np.ndarray) -> float:
        """Best similarity between a scan and the templates of one specific customer (-1.0 if none)."""
        with self._lock:
            templates = [emb for cid, emb in zip(self._customer_ids, self._embeddings) if cid == customer_id]

        query = _unit(embedding)
        return max((float(emb @ query) for emb in templates), default=-1.0)
