"""
Palm Pay -- prototype backend.

Flow implemented here (matches the two-scan UX you described):

  1. POST /session/identify   -- customer shows palm -> identify them
  2. POST /session/set-amount -- merchant enters amount, customer sees it
  3. POST /session/authorize  -- customer shows palm AGAIN to confirm
                                  -> re-verify it's the SAME person as
                                     step 1, then charge via the customer's
                                     pre-registered UPI Autopay mandate
  4. GET  /receipts/{id}      -- printable PDF receipt

Registration (customer + mandate setup) is a separate, one-time flow --
see /customers/register and the note in README.md about why mandate
approval can't be fully headless.

Run with (after `pip install -r requirements.txt` and downloading the
MediaPipe model -- see README.md):
    uvicorn backend.main:app --reload
"""

import asyncio
import base64
import io
import os
import re
from typing import List, Optional

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from backend.database import Base, engine, get_db
from backend.models import Customer, PalmEmbedding, Transaction, TransactionStatus
from backend.palm.augment import augment_palm_image
from backend.palm.detector import PalmDetector, align_palm
from backend.palm.embedder import PalmEmbedder
from backend.palm.matcher import PalmMatcher
from backend.payments.razorpay_client import RazorpayMandateClient
from backend.receipt import generate_receipt, mask_vpa
from backend.schemas import (
    AuthorizeResponse, CustomerListItemResponse, CustomerStateResponse, CustomerUpdateRequest,
    IdentifyResponse, MandateApprovedRequest, RegisterResponse, SetAmountRequest, StepUpVerifyRequest,
)
from backend.terminals import terminal_manager
from dotenv import load_dotenv
load_dotenv()

# Regex patterns for input validation
EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
PHONE_REGEX = r"^\+?[0-9]{7,15}$"
VPA_REGEX = r"^[\w.-]+@[\w.-]+$"

# --- hard business rule, enforced server-side regardless of what the client sends ---
PAYMENT_CAP_RUPEES = 100.0

# How many template embeddings we want stored per customer. If fewer real
# photos are uploaded than this, we top up with augmented variants of the
# real ones so matching isn't resting on a single static image -- see
# backend/palm/augment.py for why that's a stopgap, not a fix for having
# too few real photos overall.
TEMPLATES_PER_CUSTOMER = 6
MIN_REAL_PHOTOS = 1

RECEIPTS_DIR = os.environ.get("RECEIPTS_DIR", "./receipts")
MODEL_PATH = os.environ.get("HAND_LANDMARKER_MODEL", "hand_landmarker.task")
PCA_PATH = os.environ.get("PALM_PCA_PATH", "./pca.joblib")

Base.metadata.create_all(bind=engine)
app = FastAPI(title="Palm Pay Prototype")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler returning structured JSON responses for all unhandled errors."""
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=exc.headers,
        )
    message = str(exc) if str(exc) else f"Internal Server Error ({exc.__class__.__name__})"
    return JSONResponse(
        status_code=500,
        content={"detail": message},
    )


MATCH_THRESHOLD = float(os.environ.get("MATCH_THRESHOLD", "0.65"))
MIN_MARGIN = float(os.environ.get("MIN_MARGIN", "0.04"))
AUTO_APPROVE_MANDATE = os.environ.get("AUTO_APPROVE_MANDATE", "true").lower() == "true"

detector = PalmDetector(model_path=MODEL_PATH)
embedder = PalmEmbedder(embedding_dim=128, embedder_type="cnn")
if os.path.exists(PCA_PATH):
    embedder.load(PCA_PATH)
matcher = PalmMatcher(match_threshold=MATCH_THRESHOLD, min_margin=MIN_MARGIN)

razorpay_client = RazorpayMandateClient()  # reads RAZORPAY_KEY_ID / SECRET from env


@app.on_event("startup")
def load_existing_embeddings():
    """Matcher is in-memory, so repopulate it from the DB on every restart."""
    db = next(get_db())
    all_embs = db.query(PalmEmbedding).all()
    count = 0
    for emb_row in all_embs:
        matcher.add(customer_id=emb_row.customer_id, embedding=np.array(emb_row.vector))
        count += 1
    unique_custs = len(set(e.customer_id for e in all_embs))
    print(f"[STARTUP MATCHER] Successfully loaded {count} palm vectors for {unique_custs} customer(s) from SQLite database.")


def _read_upload_as_bgr(file_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(file_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Could not decode uploaded image")
    return img


def verify_liveness_frames(frames: List[np.ndarray]) -> bool:
    """
    Multi-frame anti-spoofing micro-motion liveness verification.
    Verifies natural optical variation between consecutive frames to prevent
    static paper/phone photo replay attacks.
    """
    if len(frames) < 2:
        return True
    diffs = []
    for i in range(len(frames) - 1):
        mse = float(np.mean((frames[i].astype(np.float32) - frames[i+1].astype(np.float32)) ** 2))
        diffs.append(mse)
    return any(d > 0.01 for d in diffs)


def _detect_align_embed(file_bytes_list: List[bytes]) -> np.ndarray:
    if not file_bytes_list:
        raise HTTPException(400, "No image payload received")

    frames = [_read_upload_as_bgr(b) for b in file_bytes_list]
    
    # Run multi-frame anti-spoofing liveness check if multiple frames sent
    if len(frames) >= 2 and not verify_liveness_frames(frames):
        raise HTTPException(422, "Anti-spoofing alert: Static photo detected. Real-time natural palm movement required.")

    # Process primary frame for detection & alignment
    landmarks = detector.detect(frames[0])
    if landmarks is None:
        raise HTTPException(422, "No hand detected in image. Please center your palm in the optical viewfinder under clear lighting.")
    aligned = align_palm(frames[0], landmarks)
    if aligned is None:
        raise HTTPException(422, "Could not align palm (hand too small/ambiguous pose). Hold your palm flat towards the camera.")
    return embedder.embed(aligned)


# ---------------------------------------------------------------------------
# Registration (one-time per customer)
# ---------------------------------------------------------------------------

@app.post("/customers/register", response_model=RegisterResponse)
def register_customer(
    name: str = Form(...),
    contact: str = Form(...),
    email: str = Form(...),
    upi_vpa: str = Form(...),
    step_up_pin: Optional[str] = Form(None),
    consent_given_at: Optional[str] = Form(None),
    consent_version: Optional[str] = Form("v1.0_DPDP_2023"),
    palm_photos: List[UploadFile] = File(
        ..., description=f"At least {MIN_REAL_PHOTOS} palm photo. More real photos (different "
                          f"angles/sessions) is always better than relying on augmentation to top up."
    ),
    db: Session = Depends(get_db),
):
    from datetime import datetime
    # Field input validation
    name_clean = name.strip()
    contact_clean = contact.strip()
    email_clean = email.strip().lower()
    upi_vpa_clean = upi_vpa.strip()

    if not name_clean:
        raise HTTPException(400, "Name is required")
    if not re.match(EMAIL_REGEX, email_clean):
        raise HTTPException(400, "Invalid email address format")
    if not re.match(PHONE_REGEX, contact_clean):
        raise HTTPException(400, "Invalid phone number format (expected 7 to 15 digits)")
    if not re.match(VPA_REGEX, upi_vpa_clean):
        raise HTTPException(400, "Invalid UPI ID format (e.g. name@bank)")

    # Deduplication check against local database
    existing = db.query(Customer).filter(
        (Customer.email == email_clean) | (Customer.contact == contact_clean)
    ).first()
    if existing:
        if existing.email == email_clean:
            raise HTTPException(400, f"A customer with email '{email_clean}' already exists")
        else:
            raise HTTPException(400, f"A customer with phone number '{contact_clean}' already exists")

    if len(palm_photos) < MIN_REAL_PHOTOS:
        raise HTTPException(400, f"Please provide at least {MIN_REAL_PHOTOS} palm photo(s)")

    aligned_real = []
    for photo in palm_photos:
        frame = _read_upload_as_bgr(photo.file.read())
        landmarks = detector.detect(frame)
        if landmarks is None:
            raise HTTPException(422, "No hand detected in one of the uploaded photos")
        aligned = align_palm(frame, landmarks)
        if aligned is None:
            raise HTTPException(422, "Could not align palm in one of the uploaded photos")
        aligned_real.append(aligned)

    # Top up with augmented variants if we got fewer real photos than
    # TEMPLATES_PER_CUSTOMER, so the matcher has more than one static
    # reference point per person. Real photos are always used as-is too.
    templates = list(aligned_real)
    if len(templates) < TEMPLATES_PER_CUSTOMER:
        needed = TEMPLATES_PER_CUSTOMER - len(templates)
        per_photo = -(-needed // len(aligned_real))  # ceil division
        for i, img in enumerate(aligned_real):
            templates.extend(augment_palm_image(img, n_variants=per_photo, seed=i))
        templates = templates[:max(TEMPLATES_PER_CUSTOMER, len(aligned_real))]

    embeddings = [embedder.embed(img) for img in templates]

    # End-to-end transactional execution
    try:
        parsed_consent_at = datetime.utcnow()
        if consent_given_at:
            try:
                parsed_consent_at = datetime.fromisoformat(consent_given_at.replace("Z", "+00:00"))
            except Exception:
                parsed_consent_at = datetime.utcnow()

        customer = Customer(
            name=name_clean,
            contact=contact_clean,
            email=email_clean,
            upi_vpa=upi_vpa_clean,
            step_up_pin=step_up_pin.strip() if step_up_pin else None,
            consent_given_at=parsed_consent_at,
            consent_version=consent_version or "v1.0_DPDP_2023"
        )
        db.add(customer)
        db.flush()  # assigns customer.id without committing yet

        # Razorpay side: create customer + mandate order
        rp_customer_id = razorpay_client.create_customer(
            name=name_clean,
            contact=contact_clean,
            email=email_clean
        )
        mandate_order_id = razorpay_client.create_mandate_order(
            razorpay_customer_id=rp_customer_id,
            mandate_limit_paise=int(PAYMENT_CAP_RUPEES * 100),
        )
        customer.razorpay_customer_id = rp_customer_id
        customer.mandate_order_id = mandate_order_id
        customer.mandate_limit_paise = int(PAYMENT_CAP_RUPEES * 100)
        if AUTO_APPROVE_MANDATE:
            customer.mandate_token_id = f"mock_token_{customer.id}"

        for vec in embeddings:
            db.add(PalmEmbedding(customer_id=customer.id, vector=vec.tolist()))

        db.commit()
        db.refresh(customer)

        # Update in-memory matcher only AFTER DB commit succeeds
        for vec in embeddings:
            matcher.add(customer_id=customer.id, embedding=vec)

        return RegisterResponse(customer_id=customer.id, mandate_order_id=mandate_order_id)
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(500, f"Registration failed during payment gateway setup: {str(e)}")


@app.get("/customers/{customer_id}", response_model=CustomerStateResponse)
def get_customer_state(customer_id: int, db: Session = Depends(get_db)):
    """Debug endpoint to inspect customer registration & mandate status."""
    customer = db.query(Customer).get(customer_id)
    if not customer:
        raise HTTPException(404, f"Customer with ID {customer_id} not found")

    return CustomerStateResponse(
        id=customer.id,
        name=customer.name,
        contact=customer.contact,
        email=customer.email,
        masked_upi=mask_vpa(customer.upi_vpa),
        razorpay_customer_id=customer.razorpay_customer_id,
        mandate_order_id=customer.mandate_order_id,
        mandate_token_id=customer.mandate_token_id,
        mandate_approved=customer.mandate_token_id is not None,
        embedding_count=len(customer.embeddings),
        consent_given_at=customer.consent_given_at,
        consent_version=customer.consent_version,
        created_at=customer.created_at,
    )


# ---------------------------------------------------------------------------
# Admin Customer Management API Endpoints
# ---------------------------------------------------------------------------

@app.get("/customers", response_model=List[CustomerListItemResponse])
def list_customers(db: Session = Depends(get_db)):
    """List all registered customers for admin management UI. Excludes raw palm vector arrays."""
    customers = db.query(Customer).order_by(Customer.created_at.desc()).all()
    results = []
    for c in customers:
        results.append(
            CustomerListItemResponse(
                id=c.id,
                name=c.name,
                contact=c.contact,
                email=c.email,
                upi_vpa=c.upi_vpa,
                masked_upi=mask_vpa(c.upi_vpa),
                razorpay_customer_id=c.razorpay_customer_id,
                mandate_order_id=c.mandate_order_id,
                mandate_token_id=c.mandate_token_id,
                mandate_approved=c.mandate_token_id is not None,
                embedding_count=len(c.embeddings),
                consent_given_at=c.consent_given_at,
                consent_version=c.consent_version,
                created_at=c.created_at,
            )
        )
    return results


@app.put("/customers/{customer_id}", response_model=CustomerListItemResponse)
def update_customer(customer_id: int, req: CustomerUpdateRequest, db: Session = Depends(get_db)):
    """Update editable details (name, contact, email, upi_vpa) for a registered customer."""
    customer = db.query(Customer).get(customer_id)
    if not customer:
        raise HTTPException(404, f"Customer with ID {customer_id} not found")

    # Validate name
    clean_name = req.name.strip()
    if not clean_name:
        raise HTTPException(422, "Name cannot be empty")

    # Validate phone format (10-digit)
    clean_contact = req.contact.strip().replace(" ", "").replace("-", "")
    if clean_contact.startswith("+91"):
        clean_contact = clean_contact[3:]
    if not clean_contact.isdigit() or len(clean_contact) != 10:
        raise HTTPException(422, "Please enter a valid 10-digit Indian phone number (e.g. 9876543210)")

    # Validate email format and domain
    clean_email = req.email.strip().lower()
    if "@" not in clean_email or "." not in clean_email.split("@")[-1]:
        raise HTTPException(422, "Please enter a valid email address (e.g. name@example.com)")

    # Validate UPI VPA
    clean_upi = req.upi_vpa.strip().lower()
    if clean_upi and ("@" not in clean_upi or len(clean_upi) < 3):
        raise HTTPException(422, "Please enter a valid UPI VPA (e.g. name@upi)")

    # Check for phone/email collision with OTHER customers
    existing_phone = db.query(Customer).filter(Customer.contact == clean_contact, Customer.id != customer_id).first()
    if existing_phone:
        raise HTTPException(400, f"Phone number {clean_contact} is already registered to another customer")

    existing_email = db.query(Customer).filter(Customer.email == clean_email, Customer.id != customer_id).first()
    if existing_email:
        raise HTTPException(400, f"Email address {clean_email} is already registered to another customer")

    customer.name = clean_name
    customer.contact = clean_contact
    customer.email = clean_email
    if clean_upi:
        customer.upi_vpa = clean_upi

    db.commit()
    db.refresh(customer)

    return CustomerListItemResponse(
        id=customer.id,
        name=customer.name,
        contact=customer.contact,
        email=customer.email,
        upi_vpa=customer.upi_vpa,
        masked_upi=mask_vpa(customer.upi_vpa),
        razorpay_customer_id=customer.razorpay_customer_id,
        mandate_order_id=customer.mandate_order_id,
        mandate_token_id=customer.mandate_token_id,
        mandate_approved=customer.mandate_token_id is not None,
        embedding_count=len(customer.embeddings),
        consent_given_at=customer.consent_given_at,
        consent_version=customer.consent_version,
        created_at=customer.created_at,
    )


@app.delete("/customers/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    """
    Permanently delete a customer record and their biometric palm embeddings.
    Retains transaction records for ledger integrity by unlinking customer_id (setting customer_id=None).
    """
    customer = db.query(Customer).get(customer_id)
    if not customer:
        raise HTTPException(404, f"Customer with ID {customer_id} not found")

    # 1. Delete associated palm embeddings from SQLite DB
    db.query(PalmEmbedding).filter_by(customer_id=customer_id).delete()

    # 2. Unlink customer reference from past transactions to preserve audit ledger integrity
    db.query(Transaction).filter_by(customer_id=customer_id).update({"customer_id": None})

    # 3. Delete customer record
    db.delete(customer)
    db.commit()

    # 4. Re-hydrate in-memory PalmMatcher to remove deleted palm vectors
    matcher.load_existing_embeddings(db)

    return {"ok": True, "message": f"Customer #{customer_id} and biometric embeddings permanently deleted"}


@app.post("/webhooks/razorpay/mandate-approved")
async def mandate_approved(
    req: MandateApprovedRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_razorpay_signature: Optional[str] = Header(None, alias="X-Razorpay-Signature"),
):
    """In production this is a signed Razorpay webhook callback.
    If RAZORPAY_WEBHOOK_SECRET is set in environment, signature verification is enforced.
    """
    webhook_secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET")
    if webhook_secret:
        if not x_razorpay_signature:
            raise HTTPException(400, "Missing X-Razorpay-Signature header")
        raw_body = await request.body()
        is_valid = razorpay_client.verify_webhook_signature(
            body_bytes=raw_body,
            signature=x_razorpay_signature,
            webhook_secret=webhook_secret,
        )
        if not is_valid:
            raise HTTPException(400, "Invalid Razorpay webhook signature")

    customer = db.query(Customer).get(req.customer_id)
    if not customer:
        raise HTTPException(404, "Unknown customer")
    customer.mandate_token_id = req.token_id
    db.commit()
    return {"ok": True, "mandate_approved": True}


# ---------------------------------------------------------------------------
# Payment flow (the two-scan UX)
# ---------------------------------------------------------------------------

@app.post("/session/identify", response_model=IdentifyResponse)
def identify(
    merchant_id: str = Form(...),
    palm_photo: Optional[UploadFile] = File(None),
    palm_photos: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
):
    files_to_read = []
    if palm_photos:
        files_to_read = [p.file.read() for p in palm_photos]
    elif palm_photo:
        files_to_read = [palm_photo.file.read()]
    else:
        raise HTTPException(400, "Please upload a palm photo for identification")

    embedding = _detect_align_embed(files_to_read)
    match_status, customer_id, confidence, margin = matcher.identify(embedding)

    print(f"[MATCHER IDENTIFY] status={match_status}, customer_id={customer_id}, similarity={confidence:.4f}, margin={margin:.4f}")

    if match_status == "reject" or customer_id is None:
        return IdentifyResponse(matched=False, status="unmatched", confidence=confidence)

    customer = db.query(Customer).get(customer_id)
    if customer.mandate_token_id is None:
        raise HTTPException(409, "Customer identified but has not completed mandate approval yet")

    txn = Transaction(
        customer_id=customer.id,
        merchant_id=merchant_id,
        status=TransactionStatus.IDENTIFIED,
        identify_confidence=confidence,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    if match_status == "borderline":
        return IdentifyResponse(
            matched=True,
            status="borderline",
            requires_step_up=True,
            step_up_prompt="Borderline match detected. Please enter your 4-digit Security PIN or last 4 digits of registered phone number.",
            customer_id=customer.id,
            name=customer.name,
            masked_upi=mask_vpa(customer.upi_vpa),
            confidence=confidence,
            session_id=txn.id,
        )

    return IdentifyResponse(
        matched=True,
        status="matched",
        requires_step_up=False,
        customer_id=customer.id,
        name=customer.name,
        masked_upi=mask_vpa(customer.upi_vpa),
        confidence=confidence,
        session_id=txn.id,
    )


@app.post("/session/set-amount")
def set_amount(req: SetAmountRequest, db: Session = Depends(get_db)):
    txn = db.query(Transaction).get(req.session_id)
    if not txn or txn.status != TransactionStatus.IDENTIFIED:
        raise HTTPException(409, "Session not in a state that accepts an amount")

    if req.amount_rupees <= 0 or req.amount_rupees > PAYMENT_CAP_RUPEES:
        raise HTTPException(400, f"Amount must be between Rs 0 and Rs {PAYMENT_CAP_RUPEES}")

    txn.amount_rupees = req.amount_rupees
    txn.status = TransactionStatus.AMOUNT_SET
    db.commit()
    return {"ok": True, "amount_rupees": req.amount_rupees}


@app.post("/session/authorize", response_model=AuthorizeResponse)
def authorize(
    session_id: int = Form(...),
    palm_photo: Optional[UploadFile] = File(None),
    palm_photos: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
):
    txn = db.query(Transaction).get(session_id)
    if not txn or txn.status not in (TransactionStatus.AMOUNT_SET, TransactionStatus.REJECTED_MISMATCH):
        raise HTTPException(409, f"Session #{session_id} not in ready state for authorization (current status: {txn.status if txn else 'None'})")

    files_to_read = []
    if palm_photos:
        files_to_read = [p.file.read() for p in palm_photos]
    elif palm_photo:
        files_to_read = [palm_photo.file.read()]
    else:
        raise HTTPException(400, "Please upload a palm photo for authorization")

    embedding = _detect_align_embed(files_to_read)
    match_status, score, margin = matcher.verify(customer_id=txn.customer_id, embedding=embedding)
    txn.authorize_confidence = score

    print(f"[MATCHER VERIFY] session_id={session_id}, customer_id={txn.customer_id}, status={match_status}, similarity={score:.4f}, margin={margin:.4f}")

    if match_status == "reject":
        txn.status = TransactionStatus.REJECTED_MISMATCH
        db.commit()
        return AuthorizeResponse(status="rejected_mismatch", reason=f"Palm did not match identified customer (confidence score: {score:.2f})")

    if match_status == "borderline":
        return AuthorizeResponse(
            status="borderline",
            requires_step_up=True,
            step_up_prompt="Borderline authorization scan detected. Please confirm your 4-digit Security PIN or last 4 digits of phone number.",
            reason="Borderline biometric confidence margin. Secondary authentication required."
        )

    customer = db.query(Customer).get(txn.customer_id)
    try:
        payment = razorpay_client.charge_with_token(
            token_id=customer.mandate_token_id,
            razorpay_customer_id=customer.razorpay_customer_id,
            amount_rupees=txn.amount_rupees,
            mandate_limit_paise=customer.mandate_limit_paise,
        )
    except Exception as e:  # noqa: BLE001 -- surface payment failures to the merchant UI
        txn.status = TransactionStatus.FAILED
        db.commit()
        return AuthorizeResponse(status="failed", reason=str(e))

    txn.status = TransactionStatus.PAID
    txn.razorpay_payment_id = payment["id"]

    receipt_path = generate_receipt(
        out_dir=RECEIPTS_DIR,
        transaction_id=txn.id,
        customer_name=customer.name,
        masked_upi=mask_vpa(customer.upi_vpa),
        amount_rupees=txn.amount_rupees,
        merchant_id=txn.merchant_id,
        razorpay_payment_id=payment["id"],
    )
    txn.receipt_path = receipt_path
    db.commit()

    return AuthorizeResponse(
        status="paid",
        requires_step_up=False,
        razorpay_payment_id=payment["id"],
        receipt_url=f"/receipts/{txn.id}",
    )


@app.post("/session/step-up-verify")
def step_up_verify(
    req: StepUpVerifyRequest,
    db: Session = Depends(get_db),
):
    """
    Step-up verification for borderline biometric matches.
    Validates user secret against step_up_pin or last 4 digits of contact phone.
    """
    from backend.schemas import StepUpVerifyRequest
    txn = db.query(Transaction).get(req.session_id)
    if not txn or not txn.customer_id:
        raise HTTPException(404, f"Transaction session #{req.session_id} not found")

    customer = db.query(Customer).get(txn.customer_id)
    if not customer:
        raise HTTPException(404, "Customer record not found")

    secret_clean = req.secret.strip()
    valid_pin = bool(customer.step_up_pin and secret_clean == customer.step_up_pin)
    valid_phone = bool(customer.contact and len(customer.contact) >= 4 and secret_clean == customer.contact[-4:])

    if not (valid_pin or valid_phone):
        raise HTTPException(401, "Incorrect security PIN or phone verification code. Secondary confirmation failed.")

    if txn.status in (TransactionStatus.AMOUNT_SET, TransactionStatus.REJECTED_MISMATCH):
        try:
            payment = razorpay_client.charge_with_token(
                token_id=customer.mandate_token_id,
                razorpay_customer_id=customer.razorpay_customer_id,
                amount_rupees=txn.amount_rupees,
                mandate_limit_paise=customer.mandate_limit_paise,
            )
        except Exception as e:
            txn.status = TransactionStatus.FAILED
            db.commit()
            return AuthorizeResponse(status="failed", reason=str(e))

        txn.status = TransactionStatus.PAID
        txn.razorpay_payment_id = payment["id"]

        receipt_path = generate_receipt(
            out_dir=RECEIPTS_DIR,
            transaction_id=txn.id,
            customer_name=customer.name,
            masked_upi=mask_vpa(customer.upi_vpa),
            amount_rupees=txn.amount_rupees,
            merchant_id=txn.merchant_id,
            razorpay_payment_id=payment["id"],
        )
        txn.receipt_path = receipt_path
        db.commit()

        return AuthorizeResponse(
            status="paid",
            requires_step_up=False,
            razorpay_payment_id=payment["id"],
            receipt_url=f"/receipts/{txn.id}",
        )

    return {"ok": True, "status": "confirmed", "customer_id": customer.id, "name": customer.name}


@app.get("/receipts/{transaction_id}")
def get_receipt(transaction_id: int, db: Session = Depends(get_db)):
    txn = db.query(Transaction).get(transaction_id)
    if not txn or not txn.receipt_path:
        raise HTTPException(404, "Receipt not found")
    return FileResponse(txn.receipt_path, media_type="application/pdf")


@app.get("/transactions")
def get_transactions(db: Session = Depends(get_db)):
    txns = db.query(Transaction).order_by(Transaction.created_at.desc()).all()
    results = []
    for t in txns:
        cust = db.query(Customer).get(t.customer_id) if t.customer_id else None
        results.append({
            "id": t.id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "customer_name": cust.name if cust else "Unknown Customer",
            "masked_upi": mask_vpa(cust.upi_vpa) if cust else "N/A",
            "amount_rupees": t.amount_rupees,
            "status": t.status.value if hasattr(t.status, 'value') else str(t.status),
            "razorpay_payment_id": t.razorpay_payment_id or "PENDING",
            "mandate_token_id": cust.mandate_token_id if cust else "N/A",
            "authorize_confidence": t.authorize_confidence
        })
    return {"transactions": results}


# ---------------------------------------------------------------------------
# Remote Raspberry Pi Terminal & WebSocket Relay Endpoints
# ---------------------------------------------------------------------------

@app.post("/terminals/{terminal_id}/pairing-token")
def create_pairing_token(terminal_id: str, request: Request):
    """
    Generates a single-use, 2-minute pairing token for a connected Pi terminal.
    Returns pair_url formatted for QR code generation.
    """
    try:
        base_url = str(request.base_url).rstrip("/")
        # Replace 0.0.0.0 or 127.0.0.1 with localhost for browser convenience if needed
        base_url = base_url.replace("0.0.0.0", "localhost")
        token_info = terminal_manager.create_pairing_token(terminal_id, base_url="http://localhost:3000")
        return token_info
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.websocket("/ws/terminal/{terminal_id}")
async def terminal_websocket(websocket: WebSocket, terminal_id: str, secret: Optional[str] = None):
    """
    WebSocket endpoint for Raspberry Pi terminal hardware.
    Authenticates static TERMINAL_SECRET via query parameter or initial auth message.
    Relays video_frame, detection_state, and capture_complete messages to paired browser.
    """
    secret_param = secret or websocket.query_params.get("secret")
    
    # If secret not in query params, attempt to receive first JSON auth message
    if not secret_param:
        await websocket.accept()
        try:
            auth_msg = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
            if auth_msg.get("type") == "auth":
                secret_param = auth_msg.get("secret")
        except Exception:
            await websocket.close(code=4001, reason="Missing secret")
            return
        
        # Connect terminal after acquiring secret from message
        expected_secret = terminal_manager.get_expected_secret()
        if secret_param != expected_secret:
            await websocket.close(code=4001, reason="Invalid terminal secret")
            return
            
        terminal_manager.terminals[terminal_id] = {
            "websocket": websocket,
            "status": "online",
            "paired_token": None,
        }
        print(f"[TERMINALS] Terminal '{terminal_id}' connected via first-message auth.")
        await websocket.send_json({"type": "auth_success", "terminal_id": terminal_id})
    else:
        success = await terminal_manager.connect_terminal(terminal_id, websocket, secret_param)
        if not success:
            return

    try:
        while True:
            msg = await websocket.receive_json()
            # Relay incoming message from Pi to paired browser session
            await terminal_manager.relay_from_pi(terminal_id, msg)
    except WebSocketDisconnect:
        await terminal_manager.disconnect_terminal(terminal_id)
    except Exception as e:
        print(f"[WS TERMINAL DISCONNECT] Terminal '{terminal_id}': {e}")
        await terminal_manager.disconnect_terminal(terminal_id)


@app.websocket("/ws/session/{pairing_token}")
async def browser_session_websocket(websocket: WebSocket, pairing_token: str):
    """
    WebSocket endpoint for Customer Phone Browser session.
    Pairs with the terminal associated with pairing_token.
    Relays start_scan and cancel messages from Browser to paired Pi.
    """
    success = await terminal_manager.connect_browser_session(pairing_token, websocket)
    if not success:
        return

    try:
        while True:
            msg = await websocket.receive_json()
            # Relay control command (start_scan, cancel) from Browser to Pi
            await terminal_manager.relay_from_browser(pairing_token, msg)
    except WebSocketDisconnect:
        await terminal_manager.disconnect_browser_session(pairing_token)
    except Exception as e:
        print(f"[WS BROWSER SESSION DISCONNECT] Token '{pairing_token}': {e}")
        await terminal_manager.disconnect_browser_session(pairing_token)

