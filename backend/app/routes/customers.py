"""Customer enrollment and admin CRUD."""

import hashlib
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import AUTO_APPROVE_MANDATE, PAYMENT_CAP_RUPEES, TEMPLATES_PER_CUSTOMER
from app.database import get_db
from app.models import Customer, PalmEmbedding, Transaction
from app.palm.augment import augment_palm_image
from app.palm.detector import align_palm
from app.schemas import CustomerStateResponse, CustomerUpdateRequest, RegisterResponse
from app.services import biometrics
from app.services.payments import razorpay_client
from app.services.receipts import mask_vpa

router = APIRouter(prefix="/customers", tags=["customers"])

EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
PHONE_REGEX = r"^\+?[0-9]{7,15}$"
VPA_REGEX = r"^[\w.-]+@[\w.-]+$"


def hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def _customer_state(c: Customer) -> CustomerStateResponse:
    return CustomerStateResponse(
        id=c.id,
        name=c.name,
        contact=c.contact,
        email=c.email,
        masked_upi=mask_vpa(c.upi_vpa),
        razorpay_customer_id=c.razorpay_customer_id,
        mandate_order_id=c.mandate_order_id,
        mandate_token_id=c.mandate_token_id,
        mandate_approved=c.mandate_token_id is not None,
        embedding_count=len(c.embeddings),
        created_at=c.created_at,
    )


def _get_customer_or_404(customer_id: int, db: Session) -> Customer:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    return customer


@router.post("/register", response_model=RegisterResponse)
def register_customer(
    name: str = Form(...),
    contact: str = Form(...),
    email: str = Form(...),
    upi_vpa: str = Form(...),
    step_up_pin: Optional[str] = Form(None),
    consent_given_at: Optional[str] = Form(None),
    consent_version: Optional[str] = Form("v1.0"),
    palm_photos: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    name_clean = name.strip()
    contact_clean = contact.strip()
    email_clean = email.strip().lower()
    upi_vpa_clean = upi_vpa.strip()

    if not name_clean:
        raise HTTPException(400, "Name is required")
    if not re.match(EMAIL_REGEX, email_clean):
        raise HTTPException(400, "Invalid email address format")
    if not re.match(PHONE_REGEX, contact_clean):
        raise HTTPException(400, "Invalid phone number format")
    if not re.match(VPA_REGEX, upi_vpa_clean):
        raise HTTPException(400, "Invalid UPI ID format (e.g. name@bank)")

    existing = db.query(Customer).filter(
        (Customer.email == email_clean) | (Customer.contact == contact_clean)
    ).first()
    if existing:
        if existing.email == email_clean:
            raise HTTPException(400, f"Customer with email '{email_clean}' already exists")
        raise HTTPException(400, f"Customer with phone '{contact_clean}' already exists")

    if not palm_photos:
        raise HTTPException(400, "Please upload at least 1 palm photo for enrollment")

    detector = biometrics.detector
    bgr_frames = [biometrics.read_upload_as_bgr(photo.file.read()) for photo in palm_photos]

    # Multi-frame motion parallax liveness check
    if len(bgr_frames) > 1:
        is_mf_live, mf_msg = detector.verify_multiframe_liveness(bgr_frames)
        if not is_mf_live:
            raise HTTPException(422, f"🫀 Multi-frame Liveness Check Failed: {mf_msg}")

    aligned_real = []
    primary_handedness = "Right"

    for frame in bgr_frames:
        landmarks, handedness, _ = detector.detect_with_meta(frame)
        if landmarks is None:
            raise HTTPException(422, "No hand detected in uploaded palm photo")

        is_open, open_msg = detector.is_open_palm(landmarks)
        if not is_open:
            raise HTTPException(422, f"Registration Posture Failed: {open_msg}")

        is_live, _, live_msg = detector.verify_liveness(frame, landmarks)
        if not is_live:
            raise HTTPException(422, f"Registration Liveness Failed: {live_msg}")

        aligned = align_palm(frame, landmarks)
        if aligned is None:
            raise HTTPException(422, "Please hold your hand vertically upright inside posture guide")

        aligned_real.append(aligned)
        primary_handedness = handedness

    # Top up templates with augmented variations if fewer than TEMPLATES_PER_CUSTOMER
    templates = list(aligned_real)
    if len(templates) < TEMPLATES_PER_CUSTOMER:
        needed = TEMPLATES_PER_CUSTOMER - len(templates)
        per_photo = -(-needed // len(aligned_real))
        for i, img in enumerate(aligned_real):
            templates.extend(augment_palm_image(img, n_variants=per_photo, seed=i))
        templates = templates[:max(TEMPLATES_PER_CUSTOMER, len(aligned_real))]

    embeddings = [biometrics.embedder.embed(img) for img in templates]

    # Biometric deduplication check
    dedup_cid, dedup_score, dedup_status = biometrics.matcher.identify(embeddings[0])
    if dedup_cid is not None and dedup_status == "matched":
        existing_cust = db.get(Customer, dedup_cid)
        cust_name = existing_cust.name if existing_cust else f"#{dedup_cid}"
        raise HTTPException(
            status_code=400,
            detail=f"⚠️ BIOMETRIC DEDUPLICATION FAILED: This palm is ALREADY enrolled under '{cust_name}' "
            f"(Confidence: {dedup_score*100:.1f}%)!"
        )

    try:
        dt_consent = datetime.fromisoformat(consent_given_at) if consent_given_at else datetime.utcnow()
        pin_hash = hash_pin(step_up_pin.strip()) if step_up_pin and len(step_up_pin.strip()) >= 4 else None

        customer = Customer(
            name=name_clean,
            contact=contact_clean,
            email=email_clean,
            upi_vpa=upi_vpa_clean,
            step_up_pin_hash=pin_hash,
            consent_given_at=dt_consent,
            consent_version=consent_version,
            registered_handedness=primary_handedness,
        )
        db.add(customer)
        db.flush()

        rp_customer_id = razorpay_client.create_customer(
            name=name_clean, contact=contact_clean, email=email_clean
        )
        mandate_order_id = razorpay_client.create_mandate_order(
            razorpay_customer_id=rp_customer_id,
            mandate_limit_paise=int(PAYMENT_CAP_RUPEES * 100),
        )

        customer.razorpay_customer_id = rp_customer_id
        customer.mandate_order_id = mandate_order_id
        if AUTO_APPROVE_MANDATE:
            customer.mandate_token_id = f"mock_token_{customer.id}"

        for vec in embeddings:
            db.add(PalmEmbedding(customer_id=customer.id, vector=vec.tolist()))

        db.commit()
        db.refresh(customer)

        for vec in embeddings:
            biometrics.matcher.add(customer_id=customer.id, embedding=vec)

        return RegisterResponse(
            customer_id=customer.id,
            mandate_order_id=mandate_order_id,
            message="Palm enrolled successfully. Mandate approval required."
        )
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Registration failed during database/gateway setup: {str(e)}")


@router.get("", response_model=List[CustomerStateResponse])
def list_customers(db: Session = Depends(get_db)):
    return [_customer_state(c) for c in db.query(Customer).all()]


@router.get("/{customer_id}", response_model=CustomerStateResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    return _customer_state(_get_customer_or_404(customer_id, db))


@router.put("/{customer_id}", response_model=CustomerStateResponse)
def update_customer(customer_id: int, req: CustomerUpdateRequest, db: Session = Depends(get_db)):
    c = _get_customer_or_404(customer_id, db)

    if req.name:
        c.name = req.name.strip()
    if req.contact:
        c.contact = req.contact.strip()
    if req.email:
        c.email = req.email.strip().lower()
    if req.upi_vpa:
        c.upi_vpa = req.upi_vpa.strip()
    if req.step_up_pin:
        c.step_up_pin_hash = hash_pin(req.step_up_pin.strip())

    db.commit()
    db.refresh(c)
    return _customer_state(c)


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    c = _get_customer_or_404(customer_id, db)

    # Retain transaction audit records by setting customer_id to null
    db.query(Transaction).filter(Transaction.customer_id == customer_id).update({"customer_id": None})
    db.delete(c)
    db.commit()

    biometrics.reload_matcher(db)

    return {"ok": True, "message": f"Customer #{customer_id} deleted. Embeddings purged."}
