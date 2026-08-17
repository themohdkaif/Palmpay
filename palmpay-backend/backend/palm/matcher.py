"""
Identity matching over enrolled palm embeddings with dual-gate security:

1. Similarity Gate: Top match score must clear the minimum similarity threshold.
2. Margin Gate: Top match score must beat the second-best distinct customer score
   by a minimum confidence margin. If a near-tie occurs, the matcher rejects
   the query (returns None) rather than guessing.
"""

import threading
from typing import Dict, List, Optional, Tuple

import numpy as np


class PalmMatcher:
    def __init__(self, match_threshold: float = 0.65, min_margin: float = 0.04):
        self.threshold = match_threshold
        self.min_margin = min_margin
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

    def _group_similarity_by_customer(self, query: np.ndarray) -> List[Tuple[int, float]]:
        """
        Computes maximum similarity score per customer identity across all template
        embeddings enrolled for each customer. Returns sorted list of (customer_id, top_score).
        """
        with self._lock:
            if not self._embeddings:
                return []
            embeddings_matrix = np.stack(self._embeddings)
            customer_ids = list(self._customer_ids)

        q = query / (np.linalg.norm(query) or 1.0)
        sims = embeddings_matrix @ q  # Cosine similarity array

        best_per_customer: Dict[int, float] = {}
        for cid, score in zip(customer_ids, sims):
            best_per_customer[cid] = max(best_per_customer.get(cid, -1.0), float(score))

        return sorted(best_per_customer.items(), key=lambda x: x[1], reverse=True)

    def identify(self, embedding: np.ndarray) -> Tuple[Optional[int], float]:
        """
        Scan 1 Identification with Dual-Gate Security:
        Returns (customer_id, similarity) ONLY IF:
          1. top_score >= threshold, AND
          2. (top_score - second_best_score) >= min_margin
        Otherwise returns (None, top_score) -- zero guessing on ambiguous near-ties.
        """
        sorted_scores = self._group_similarity_by_customer(embedding)
        if not sorted_scores:
            return None, 0.0

        top_cid, top_score = sorted_scores[0]
        second_score = sorted_scores[1][1] if len(sorted_scores) > 1 else -1.0
        margin = top_score - second_score if len(sorted_scores) > 1 else 1.0

        # Check 1: Similarity Threshold
        if top_score < self.threshold:
            print(f"[MATCHER IDENTIFY REJECT] Top score {top_score:.4f} < threshold {self.threshold:.4f}")
            return None, top_score

        # Check 2: Margin Gate (only applicable if >1 customer enrolled)
        if len(sorted_scores) > 1 and margin < self.min_margin:
            print(f"[MATCHER IDENTIFY AMBIGUOUS REJECT] Top customer #{top_cid} score {top_score:.4f} near-tie with customer #{sorted_scores[1][0]} score {second_score:.4f} (margin {margin:.4f} < min_margin {self.min_margin:.4f})")
            return None, top_score

        return top_cid, top_score

    def verify(self, customer_id: int, embedding: np.ndarray) -> Tuple[bool, float]:
        """
        Scan 2 Payment Authorization Verification with Dual-Gate Security:
        Confirms scan matches identified target customer_id AND clears margin gate against others.
        """
        sorted_scores = self._group_similarity_by_customer(embedding)
        if not sorted_scores:
            return False, 0.0

        target_score = -1.0
        other_top_score = -1.0

        for cid, score in sorted_scores:
            if cid == customer_id:
                target_score = score
            elif other_top_score < 0:
                other_top_score = score

        if target_score < self.threshold:
            print(f"[MATCHER VERIFY REJECT] Target customer #{customer_id} score {target_score:.4f} < threshold {self.threshold:.4f}")
            return False, target_score

        margin = target_score - (other_top_score if other_top_score > -1.0 else -1.0)
        if other_top_score > -1.0 and margin < self.min_margin:
            print(f"[MATCHER VERIFY AMBIGUOUS REJECT] Target customer #{customer_id} score {target_score:.4f} vs competitor {other_top_score:.4f} (margin {margin:.4f} < min_margin {self.min_margin:.4f})")
            return False, target_score

        return True, target_score
