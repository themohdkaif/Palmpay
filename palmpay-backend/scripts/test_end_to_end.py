import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import cv2
import numpy as np
from sqlalchemy.orm import Session

from backend.database import SessionLocal, engine, Base
from backend.models import Customer, PalmEmbedding
from backend.palm.detector import Landmark, align_palm
from backend.palm.embedder import PalmEmbedder
from backend.palm.matcher import PalmMatcher

def run_end_to_end_test():
    print("=" * 60)
    print("PALMPAY END-TO-END IN-MEMORY & DB PERSISTENCE TEST")
    print("=" * 60)

    # 1. Initialize DB and Embedder/Matcher
    db = SessionLocal()
    embedder = PalmEmbedder(embedding_dim=24)
    if os.path.exists("./pca.joblib"):
        embedder.load("./pca.joblib")
        print("[CHECK 1] PCA model loaded successfully from ./pca.joblib")
    else:
        print("[FAIL] ./pca.joblib model missing!")
        return

    matcher = PalmMatcher(match_threshold=0.60)

    # 2. Simulate startup loading from SQLite
    all_embs = db.query(PalmEmbedding).all()
    for emb in all_embs:
        matcher.add(customer_id=emb.customer_id, embedding=np.array(emb.vector))
    print(f"[CHECK 2] Startup hydration loaded {len(all_embs)} embeddings into memory.")

    # 3. Create synthetic palm image for Person #1
    rng = np.random.default_rng(42)
    synthetic_palm = rng.integers(0, 255, size=(224, 224, 3), dtype=np.uint8)
    synthetic_palm = cv2.GaussianBlur(synthetic_palm, (15, 15), 0)
    embedding1 = embedder.embed(synthetic_palm)

    # 4. Enroll customer into DB and Matcher memory
    test_email = "test_aditya@example.com"
    existing = db.query(Customer).filter(Customer.email == test_email).first()
    if not existing:
        customer = Customer(
            name="Aditya Sharma",
            contact="+919876543210",
            email=test_email,
            upi_vpa="aditya@hdfcbank",
            mandate_token_id="mock_token_test",
            razorpay_customer_id="cust_test_1"
        )
        db.add(customer)
        db.flush()

        db.add(PalmEmbedding(customer_id=customer.id, vector=embedding1.tolist()))
        db.commit()
        customer_id = customer.id
        print(f"[CHECK 3] Registered new customer #{customer_id} into SQLite database.")
    else:
        customer_id = existing.id
        print(f"[CHECK 3] Customer #{customer_id} already exists in database.")

    # Add embedding to in-memory matcher
    matcher.add(customer_id=customer_id, embedding=embedding1)
    print(f"[CHECK 4] Added embedding vector to in-memory PalmMatcher.")

    # 5. Immediate identification test (In-Memory)
    query_img = synthetic_palm.copy()
    query_emb = embedder.embed(query_img)
    matched_id, score = matcher.identify(query_emb)
    print(f"[CHECK 5] Immediate identify scan result: matched_id={matched_id}, similarity_score={score:.4f}")
    assert matched_id == customer_id, f"Expected customer {customer_id}, got {matched_id}"

    # 6. Simulate fresh server restart (Re-hydration test)
    fresh_matcher = PalmMatcher(match_threshold=0.60)
    reloaded_embs = db.query(PalmEmbedding).filter(PalmEmbedding.customer_id == customer_id).all()
    for emb in reloaded_embs:
        fresh_matcher.add(customer_id=emb.customer_id, embedding=np.array(emb.vector))
    
    restart_matched_id, restart_score = fresh_matcher.identify(query_emb)
    print(f"[CHECK 6] Post-restart re-hydration identify result: matched_id={restart_matched_id}, score={restart_score:.4f}")
    assert restart_matched_id == customer_id, f"Post-restart expected customer {customer_id}, got {restart_matched_id}"

    print("\n" + "=" * 60)
    print("[SUCCESS] ALL PERSISTENCE & RE-HYDRATION TESTS PASSED 100%!")
    print("=" * 60)
    db.close()

if __name__ == "__main__":
    run_end_to_end_test()
