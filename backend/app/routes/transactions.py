"""Merchant ledger and PDF receipts."""

import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import RECEIPTS_DIR
from app.database import get_db
from app.models import Transaction
from app.schemas import TransactionItem, TransactionListResponse
from app.services.receipts import mask_vpa, receipt_filename

router = APIRouter(tags=["transactions"])


@router.get("/transactions", response_model=TransactionListResponse)
def list_transactions(db: Session = Depends(get_db)):
    txns = db.query(Transaction).order_by(Transaction.created_at.desc()).all()
    return TransactionListResponse(transactions=[
        TransactionItem(
            id=t.id,
            created_at=t.created_at,
            customer_name=t.customer.name if t.customer else "Unknown",
            masked_upi=mask_vpa(t.customer.upi_vpa) if t.customer else "N/A",
            amount_rupees=t.amount_rupees,
            status=t.status.value if hasattr(t.status, "value") else str(t.status),
            razorpay_payment_id=t.razorpay_payment_id,
            mandate_token_id=t.customer.mandate_token_id if t.customer else None,
            authorize_confidence=t.authorize_confidence or t.identify_confidence,
        )
        for t in txns
    ])


@router.get("/receipts/{transaction_id}")
def get_receipt(transaction_id: int, db: Session = Depends(get_db)):
    txn = db.get(Transaction, transaction_id)
    # Resolve by filename inside RECEIPTS_DIR so receipts survive the data directory being moved.
    path = os.path.join(RECEIPTS_DIR, receipt_filename(transaction_id))
    if not txn or not txn.receipt_path or not os.path.exists(path):
        raise HTTPException(404, "Receipt PDF not found")
    return FileResponse(path, media_type="application/pdf")
