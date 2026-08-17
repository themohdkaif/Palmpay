"""
Empirical FAR / FRR Threshold Evaluation Script for PalmPay Biometric Verification.

Computes genuine-pair similarity distribution (same person, different scans)
and impostor-pair similarity distribution (different people) across the enrolled
customer dataset. Evaluates False Accept Rate (FAR) and False Reject Rate (FRR)
for cosine similarity thresholds from 0.30 to 0.95 and recommends the optimal
security threshold for payment authorization.
"""

import json
import sqlite3
import numpy as np


def evaluate_far_frr(db_path: str = "palmpay.db"):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    rows = cur.execute("SELECT customer_id, vector FROM palm_embeddings").fetchall()
    conn.close()

    if not rows:
        print("No embeddings found in database for evaluation.")
        return

    embeddings = []
    customer_ids = []

    for cid, vec_json in rows:
        v = np.array(json.loads(vec_json), dtype=np.float32)
        norm = np.linalg.norm(v)
        if norm > 0:
            v = v / norm
        embeddings.append(v)
        customer_ids.append(cid)

    embeddings = np.array(embeddings)
    customer_ids = np.array(customer_ids)

    num_samples = len(embeddings)
    sim_matrix = embeddings @ embeddings.T

    genuine_scores = []
    impostor_scores = []

    for i in range(num_samples):
        for j in range(i + 1, num_samples):
            score = float(sim_matrix[i, j])
            if customer_ids[i] == customer_ids[j]:
                genuine_scores.append(score)
            else:
                impostor_scores.append(score)

    genuine_scores = np.array(genuine_scores)
    impostor_scores = np.array(impostor_scores)

    print("=" * 70)
    print("      PALMPAY BIOMETRIC VERIFICATION — FAR / FRR THRESHOLD ANALYSIS")
    print("=" * 70)
    print(f"Total Vector Embeddings Analyzed: {num_samples}")
    print(f"Distinct Customer Identities:     {len(set(customer_ids))}")
    print(f"Total Genuine Pairs Evaluated:    {len(genuine_scores)}")
    print(f"Total Impostor Pairs Evaluated:   {len(impostor_scores)}")
    print("-" * 70)
    print(f"Genuine Similarity Mean:          {np.mean(genuine_scores):.4f} (std: {np.std(genuine_scores):.4f})")
    print(f"Impostor Similarity Mean:         {np.mean(impostor_scores):.4f} (std: {np.std(impostor_scores):.4f})")
    print("=" * 70)

    print(f"\n{'Threshold':<12} | {'FAR (%)':<10} | {'FRR (%)':<10} | {'Security Rating':<20}")
    print("-" * 60)

    thresholds = np.arange(0.30, 0.96, 0.05)
    best_threshold = 0.70
    min_far = 1.0

    for t in thresholds:
        # FAR: fraction of impostor pairs that score >= t (false accept)
        far = np.mean(impostor_scores >= t) if len(impostor_scores) > 0 else 0.0
        # FRR: fraction of genuine pairs that score < t (false reject)
        frr = np.mean(genuine_scores < t) if len(genuine_scores) > 0 else 0.0

        rating = "Low Security"
        if far == 0.0 and frr <= 0.15:
            rating = "Optimal (Zero FAR)"
        elif far == 0.0:
            rating = "Strict (Zero FAR)"
        elif far <= 0.05:
            rating = "Moderate"

        if far == 0.0 and far <= min_far:
            min_far = far
            best_threshold = t

        print(f"{t:<12.2f} | {far * 100:<10.2f} | {frr * 100:<10.2f} | {rating:<20}")

    print("=" * 70)
    print(f"RECOMMENDED PAYMENT SECURITY THRESHOLD: {best_threshold:.2f}")
    print(f"At threshold = {best_threshold:.2f}: FAR = {np.mean(impostor_scores >= best_threshold)*100:.2f}%, FRR = {np.mean(genuine_scores < best_threshold)*100:.2f}%")
    print("Note: In payment biometrics, threshold selection strictly prioritizes FAR=0% to prevent unauthorized charges.")
    print("=" * 70)

    return best_threshold


if __name__ == "__main__":
    evaluate_far_frr()
