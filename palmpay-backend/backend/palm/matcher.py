"""
Identity matching over enrolled palm embeddings.

The `threshold` is the single most safety-critical parameter in this system:
  - Low threshold (< 0.50): Increases False Accept Rate (FAR) risk -- stranger matched to wrong account.
  - High threshold (> 0.75): Increases False Reject Rate (FRR) risk -- legitimate customer rejected.

Empirical FAR / FRR analysis on enrolled dataset (see scripts/evaluate_threshold.py):
  - Threshold = 0.60 -> FAR: 0.66%,  FRR: 40.83%
  - Threshold = 0.70 -> FAR: 0.09%,  FRR: 55.83% (Recommended operational threshold)
  - Threshold = 0.80 -> FAR: 0.00%,  FRR: 78.33% (Strict Zero-FAR mode)
"""

import threading
from typing import List, Optional, Tuple

import numpy as np


class PalmMatcher:
    def __init__(self, match_threshold: float = 0.70):
        self.threshold = match_threshold
        self._embeddings: List[np.ndarray] = []
        self._customer_ids: List[int] = []
        self._lock = threading.Lock()

    def load_existing_embeddings(self, db_session) -> None:
        """Hydrate matcher in-memory matrix from database on startup."""
        from backend.models import PalmEmbedding
        rows = db_session.query(PalmEmbedding).all()
        with self._lock:
            self._embeddings.clear()
            self._customer_ids.clear()
            for r in rows:
                v = np.array(r.vector, dtype=np.float32)
                norm = np.linalg.norm(v)
                if norm > 0:
                    v = v / norm
                self._embeddings.append(v)
                self._customer_ids.append(r.customer_id)

    def add(self, customer_id: int, embedding: np.ndarray) -> None:
        norm_emb = embedding / (np.linalg.norm(embedding) or 1.0)
        with self._lock:
            self._embeddings.append(norm_emb)
            self._customer_ids.append(customer_id)

    def identify(self, embedding: np.ndarray) -> Tuple[Optional[int], float]:
        """Returns (customer_id, similarity) for best match above threshold, or (None, best_score)."""
        with self._lock:
            if not self._embeddings:
                return None, 0.0
            embeddings_matrix = np.stack(self._embeddings)
            customer_ids = list(self._customer_ids)

        query = embedding / (np.linalg.norm(embedding) or 1.0)
        sims = embeddings_matrix @ query  # Cosine similarity
        best_idx = int(np.argmax(sims))
        best_score = float(sims[best_idx])

        if best_score < self.threshold:
            return None, best_score
        return customer_ids[best_idx], best_score

    def verify(self, customer_id: int, embedding: np.ndarray) -> Tuple[bool, float]:
        """Verifies step 2 authorization scan matches the step 1 customer_id."""
        with self._lock:
            embeddings_list = list(self._embeddings)
            customer_ids = list(self._customer_ids)

        query = embedding / (np.linalg.norm(embedding) or 1.0)
        best_score = -1.0
        for cid, emb in zip(customer_ids, embeddings_list):
            if cid == customer_id:
                score = float(emb @ query)
                best_score = max(best_score, score)
        return best_score >= self.threshold, best_score
