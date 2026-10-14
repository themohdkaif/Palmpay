"""Two-scan payment session: identify -> set amount -> authorize (or step-up PIN fallback)."""

import logging

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import PAYMENT_CAP_RUPEES, RECEIPTS_DIR, VERIFY_THRESHOLD
from app.database import get_db
from app.models import Customer, Transaction, TransactionStatus
from app.routes.customers import hash_pin
from app.schemas import (
    AuthorizeResponse, IdentifyResponse, SetAmountRequest, SetAmountResponse, StepUpVerifyRequest,
)
from app.services import biometrics
from app.services.payments import razorpay_client
from app.services.receipts import generate_receipt, mask_vpa

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/session", tags=["session"])


def _session_customer(txn: Transaction, db: Session) -> Customer:
    customer = db.get(Customer, txn.customer_id) if txn.customer_id is not None else None
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


def _reject(txn: Transaction, db: Session, reason: str) -> AuthorizeResponse:
    txn.status = TransactionStatus.REJECTED_MISMATCH
    db.commit()
    return AuthorizeResponse(status="rejected_mismatch", reason=reason)


def _charge_and_issue_receipt(txn: Transaction, customer: Customer, db: Session) -> AuthorizeResponse:
    """Charge the customer's mandate for the session amount and generate the PDF receipt."""
    if not txn.amount_rupees or txn.amount_rupees <= 0:
        raise HTTPException(400, "Payment amount has not been confirmed in Step 2. Please confirm amount first.")

    try:
        payment = razorpay_client.charge_with_token(
            token_id=customer.mandate_token_id or f"mock_token_{customer.id}",
            razorpay_customer_id=customer.razorpay_customer_id or f"cust_{customer.id}",
            amount_rupees=txn.amount_rupees,
            mandate_limit_paise=customer.mandate_limit_paise,
        )
    except Exception as e:
        txn.status = TransactionStatus.FAILED
        db.commit()
        return AuthorizeResponse(status="failed", reason=str(e))

    txn.status = TransactionStatus.PAID
    txn.razorpay_payment_id = payment["id"]
    txn.receipt_path = generate_receipt(
        out_dir=RECEIPTS_DIR,
        transaction_id=txn.id,
        customer_name=customer.name,
        masked_upi=mask_vpa(customer.upi_vpa),
        amount_rupees=txn.amount_rupees,
        merchant_id=txn.merchant_id,
        razorpay_payment_id=payment["id"],
    )
    db.commit()

    return AuthorizeResponse(
        status="paid",
        amount_rupees=txn.amount_rupees,
        razorpay_payment_id=payment["id"],
        receipt_url=f"/receipts/{txn.id}",
    )


@router.post("/identify", response_model=IdentifyResponse)
def identify(
    merchant_id: str = Form(...),
    palm_photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Scan 1: identify the customer from a palm photo and open a payment session."""
    embedding, handedness, liveness_score = biometrics.detect_align_embed(palm_photo.file.read())
    cid, confidence, status_label = biometrics.matcher.identify(embedding)
    logger.info(
        "identify merchant=%s handedness=%s liveness=%.4f -> customer=%s confidence=%.4f status=%s",
        merchant_id, handedness, liveness_score, cid, confidence, status_label,
    )

    if cid is None or status_label == "unmatched":
        return IdentifyResponse(
            matched=False,
            status="unmatched",
            requires_step_up=False,
            confidence=confidence,
            message="Palm not recognized. Please retry or register."
        )

    customer = db.get(Customer, cid)
    if not customer:
        return IdentifyResponse(matched=False, status="unmatched", confidence=confidence)

    if customer.registered_handedness and handedness and customer.registered_handedness != handedness:
        raise HTTPException(
            status_code=400,
            detail=f"⚠️ HANDEDNESS MISMATCH: Customer '{customer.name}' registered with {customer.registered_handedness} hand, "
            f"but presented {handedness} hand! Please scan with your {customer.registered_handedness} hand."
        )

    txn = Transaction(
        customer_id=customer.id,
        merchant_id=merchant_id,
        status=TransactionStatus.IDENTIFIED,
        identify_confidence=confidence,
        identify_handedness=handedness,
        identify_embedding=embedding.tolist(),
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    return IdentifyResponse(
        matched=True,
        status=status_label,
        requires_step_up=False,
        customer_id=customer.id,
        name=customer.name,
        masked_upi=mask_vpa(customer.upi_vpa),
        confidence=confidence,
        session_id=txn.id,
        handedness=handedness,
    )


@router.post("/set-amount", response_model=SetAmountResponse)
def set_amount(req: SetAmountRequest, db: Session = Depends(get_db)):
    txn = db.get(Transaction, req.session_id)
    if not txn or txn.status != TransactionStatus.IDENTIFIED:
        raise HTTPException(status_code=409, detail="Session not in a state that accepts an amount")

    if req.amount_rupees <= 0 or req.amount_rupees > PAYMENT_CAP_RUPEES:
        raise HTTPException(status_code=400, detail=f"Amount must be between Rs 0 and Rs {PAYMENT_CAP_RUPEES}")

    txn.amount_rupees = req.amount_rupees
    txn.status = TransactionStatus.AMOUNT_SET
    db.commit()
    return SetAmountResponse(ok=True, amount_rupees=req.amount_rupees)


@router.post("/authorize", response_model=AuthorizeResponse)
def authorize(
    session_id: int = Form(...),
    palm_photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Scan 2: verify the same palm again, then charge the mandate and issue a receipt."""
    txn = db.get(Transaction, session_id)
    if not txn or txn.status not in (TransactionStatus.AMOUNT_SET, TransactionStatus.REJECTED_MISMATCH, TransactionStatus.BORDERLINE):
        raise HTTPException(status_code=409, detail="Session not ready for authorization")

    embedding, handedness, _ = biometrics.detect_align_embed(palm_photo.file.read())

    # 1. Strict handedness check
    if txn.identify_handedness and handedness and txn.identify_handedness != handedness:
        logger.info("authorize session=%s rejected: handedness %s vs %s", session_id, txn.identify_handedness, handedness)
        return _reject(
            txn, db,
            f"⚠️ HANDEDNESS MISMATCH! Step 1 used {txn.identify_handedness} hand, but authorization used {handedness} hand."
        )

    # 2. Strict customer identity lock
    scanned_cid, _, _ = biometrics.matcher.identify(embedding)
    if scanned_cid is not None and scanned_cid != txn.customer_id:
        step1_cust = db.get(Customer, txn.customer_id) if txn.customer_id is not None else None
        step1_name = step1_cust.name if step1_cust else f"#{txn.customer_id}"
        logger.info("authorize session=%s rejected: customer %s vs scanned %s", session_id, txn.customer_id, scanned_cid)
        return _reject(
            txn, db,
            f"⚠️ DIFFERENT USER DETECTED! Session started by '{step1_name}', but hand belongs to another user."
        )

    # 3. Best of: similarity to enrolled templates, direct similarity between scan 1 and scan 2
    session_sim = -1.0
    if txn.identify_embedding:
        step1_vec = np.array(txn.identify_embedding, dtype=np.float32)
        step1_norm = step1_vec / (np.linalg.norm(step1_vec) or 1.0)
        scan2_norm = embedding / (np.linalg.norm(embedding) or 1.0)
        session_sim = float(step1_norm @ scan2_norm)

    verify_score = biometrics.matcher.verify(txn.customer_id, embedding)
    effective_score = max(verify_score, session_sim)
    txn.authorize_confidence = effective_score
    logger.info(
        "authorize session=%s enrolled=%.4f session=%.4f effective=%.4f threshold=%.4f",
        session_id, verify_score, session_sim, effective_score, VERIFY_THRESHOLD,
    )

    if effective_score < VERIFY_THRESHOLD:
        return _reject(
            txn, db,
            f"⚠️ PALM MISMATCH — PAYMENT REJECTED! (Confidence {effective_score*100:.1f}%) Hand presented does not match customer identified in Step 1."
        )

    return _charge_and_issue_receipt(txn, _session_customer(txn, db), db)


@router.post("/step-up-verify", response_model=AuthorizeResponse)
def step_up_verify(req: StepUpVerifyRequest, db: Session = Depends(get_db)):
    """Fallback: authorize the session with the enrolled PIN (or phone number / its last 4 digits)."""
    txn = db.get(Transaction, req.session_id)
    if not txn or txn.status not in (TransactionStatus.IDENTIFIED, TransactionStatus.AMOUNT_SET, TransactionStatus.BORDERLINE):
        raise HTTPException(status_code=409, detail="Session not in a state allowing step-up verification")

    customer = _session_customer(txn, db)

    if not txn.amount_rupees or txn.amount_rupees <= 0:
        raise HTTPException(status_code=400, detail="Payment amount has not been confirmed in Step 2. Please confirm amount first.")

    secret = req.secret.strip()
    digits = "".join(filter(str.isdigit, customer.contact))
    is_valid = (
        (customer.step_up_pin_hash is not None and hash_pin(secret) == customer.step_up_pin_hash)
        or secret == digits[-4:]
        or secret == digits
    )
    if not is_valid:
        return AuthorizeResponse(status="failed", reason="Invalid Step-Up PIN or contact verification secret.")

    return _charge_and_issue_receipt(txn, customer, db)
