from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CustomerStateResponse(BaseModel):
    id: int
    name: str
    contact: str
    email: Optional[str] = None
    masked_upi: str
    razorpay_customer_id: Optional[str] = None
    mandate_order_id: Optional[str] = None
    mandate_token_id: Optional[str] = None
    mandate_approved: bool
    embedding_count: int
    consent_given_at: Optional[datetime] = None
    consent_version: Optional[str] = None
    created_at: datetime


class CustomerListItemResponse(BaseModel):
    id: int
    name: str
    contact: str
    email: Optional[str] = None
    upi_vpa: str
    masked_upi: str
    razorpay_customer_id: Optional[str] = None
    mandate_order_id: Optional[str] = None
    mandate_token_id: Optional[str] = None
    mandate_approved: bool
    embedding_count: int
    consent_given_at: Optional[datetime] = None
    consent_version: Optional[str] = None
    created_at: datetime


class CustomerUpdateRequest(BaseModel):
    name: str
    contact: str
    email: str
    upi_vpa: str


class RegisterResponse(BaseModel):
    customer_id: int
    mandate_order_id: str
    message: str = "Mandate order created. Customer must approve it once in their UPI app."


class MandateApprovedRequest(BaseModel):
    customer_id: int
    token_id: str


class IdentifyResponse(BaseModel):
    matched: bool
    status: str = "matched"  # "matched" | "borderline" | "unmatched"
    requires_step_up: bool = False
    step_up_prompt: Optional[str] = None
    customer_id: Optional[int] = None
    name: Optional[str] = None
    masked_upi: Optional[str] = None
    confidence: float
    session_id: Optional[int] = None


class SetAmountRequest(BaseModel):
    session_id: int
    amount_rupees: float


class AuthorizeResponse(BaseModel):
    status: str  # "paid" | "borderline" | "rejected_mismatch" | "failed"
    requires_step_up: bool = False
    step_up_prompt: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    receipt_url: Optional[str] = None
    reason: Optional[str] = None


class StepUpVerifyRequest(BaseModel):
    session_id: int
    secret: str  # 4-digit security PIN or last 4 digits of phone number
