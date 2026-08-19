# PalmPay Frontend Integration & Verified Backend API Contract

> **Local Integration Status: Verified & Live**
>
> The PalmPay frontend application (Next.js 14 on `http://localhost:3000`) is fully integrated and running against the local Python/FastAPI backend (`http://localhost:8000`) cloned from `GULSHANKUMAR6079/palmpe`.
>
> **Reference Backup Branch**: The frontend-only state before backend integration is preserved locally on git branch:
> ```bash
> git checkout backup-frontend-only-before-integration
> ```

---

## 1. Local Environment Configuration

- **Frontend App**: `http://localhost:3000` (Next.js 14 dev server)
- **Backend API Base**: `http://localhost:8000` (FastAPI + Uvicorn server in `backend/`)
- **WebSocket Relay**: `ws://localhost:8000/ws/session/{pairing_token}`
- **Database**: `backend/palmpay.db` (SQLite + SQLAlchemy)

Configuration set in `.env.local` / environment:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Active Biometric Embedder Configuration
- **Active Embedder**: `HOG+PCA (PalmEmbedder)` with `pca.joblib` pre-trained PCA whitening matrix.
- **Rationale**: Chosen after 2026-08-19 empirical testing demonstrated cleaner genuine/impostor separation gap ($+0.3159$) than un-centered deep MobileNetV3 CNN features (which compress cosine similarities above $0.91$).
- **Rule**: Do not switch `backend/main.py` to `PalmEmbedderCNN` without re-running the three-way feature separation benchmark.

---

## 2. Verified HTTP REST API Contract

All endpoints below have been verified against the running backend instance:

### 2.1 Customer Registration & Autopay Mandate Setup
- **Endpoint**: `POST /customers/register`
- **Content-Type**: `multipart/form-data`
- **Request Parameters**:
  - `name`: Customer full name (string, required)
  - `contact`: 10-digit phone number (string, required)
  - `email`: Customer email address (string, required)
  - `upi_vpa`: Linked UPI VPA address (string, required)
  - `consent_given_at`: ISO-8601 timestamp (string, optional)
  - `consent_version`: Consent version string (string, optional, default `"v1.0"`)
  - `palm_photos`: Palm camera image frame file(s) (List[UploadFile], required)
- **Response Format (`RegisterResponse`)**:
  ```json
  {
    "customer_id": 1,
    "mandate_order_id": "order_NzK123456789",
    "message": "Palm enrolled successfully. Mandate approval required."
  }
  ```

---

### 2.2 Biometric Scan 1: Customer Identification
- **Endpoint**: `POST /session/identify`
- **Content-Type**: `multipart/form-data`
- **Request Parameters**:
  - `merchant_id`: Merchant terminal identifier (string, required)
  - `palm_photo`: Captured palm frame image file (UploadFile, required)
- **Response Format (`IdentifyResponse`)**:
  ```json
  {
    "matched": true,
    "status": "matched", // "matched" | "unmatched"
    "customer_id": 1,
    "name": "Aditya Sharma",
    "masked_upi": "adi****@hdfcbank",
    "confidence": 0.984,
    "session_id": 104,
    "message": null,
    "handedness": "Right"
  }
  ```

---

### 2.3 Set Transaction Remittance Amount
- **Endpoint**: `POST /session/set-amount`
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "session_id": 104,
    "amount_rupees": 50
  }
  ```
- **Response Format (`SetAmountResponse`)**:
  ```json
  {
    "ok": true,
    "amount_rupees": 50
  }
  ```

---

### 2.4 Biometric Scan 2: Payment Authorization
- **Endpoint**: `POST /session/authorize`
- **Content-Type**: `multipart/form-data`
- **Request Parameters**:
  - `session_id`: Active transaction session ID (integer, required)
  - `palm_photo`: Captured palm frame image file (UploadFile, required)
- **Response Format (`AuthorizeResponse`)**:
  ```json
  {
    "status": "paid", // "paid" | "rejected_mismatch" | "failed"
    "amount_rupees": 50.0,
    "razorpay_payment_id": "pay_Kx9876543210",
    "receipt_url": "/receipts/104",
    "reason": null
  }
  ```

---

### 2.5 Merchant Ledger Transactions
- **Endpoint**: `GET /transactions`
- **Response Format (`TransactionListResponse`)**:
  ```json
  {
    "transactions": [
      {
        "id": 104,
        "created_at": "2026-08-18T15:30:00Z",
        "customer_name": "Aditya Sharma",
        "masked_upi": "adi****@hdfcbank",
        "amount_rupees": 50,
        "status": "paid",
        "razorpay_payment_id": "pay_Kx9876543210",
        "mandate_token_id": "mock_token_1",
        "authorize_confidence": 0.984
      }
    ]
  }
  ```

---

### 2.7 Customer Directory & Administration
- **`GET /customers`**: Returns list of enrolled customers (`CustomerStateResponse[]`).
- **`GET /customers/{id}`**: Returns single customer profile.
- **`PUT /customers/{id}`**: Updates profile (`name`, `contact`, `email`, `upi_vpa`).
- **`DELETE /customers/{id}`**: Deletes customer and purges embeddings while preserving transaction audit logs.

---

## 3. Remote Raspberry Pi WebSocket Relay Protocol

- **Pairing Token Generator**: `POST /terminals/{terminal_id}/pairing-token`
- **WebSocket Endpoint**: `ws://localhost:8000/ws/session/{pairing_token}`
- **Message Types**: `pairing_success`, `video_frame`, `detection_state`, `capture_complete`, `start_scan`, `cancel`.
