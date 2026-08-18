# PalmPay Frontend Integration Specification & Backend API Contract

> **Notice for Developers & Backend Implementers**
>
> The PalmPay frontend application is structured as a clean, decoupled Next.js 14 web application. No local backend service is currently running in this branch.
>
> **Full Reference Implementation Preserved**: The complete Python/FastAPI backend (including the MediaPipe hand landmarker, CLAHE texture normalization, MobileNetV2 PCA 128-D vector embedder, dual-margin matcher, SQLite vault, Razorpay Autopay client, PDF receipt generator, WebSocket relay hub, and standalone Raspberry Pi client) is safely preserved on the git branch:
> ```bash
> git checkout backup-full-stack-before-split
> ```

---

## 1. Backend Configuration

Set the backend API base URL in `.env.local` (or environment variables):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The frontend uses `NEXT_PUBLIC_API_URL` as the base URL for HTTP endpoints and derives `ws://` / `wss://` URLs for WebSocket sessions.

---

## 2. HTTP REST API Contract

The frontend calls the following endpoints defined in [`lib/api-client.ts`](file:///Users/mohdkaif/Desktop/Payment/lib/api-client.ts) and [`lib/types.ts`](file:///Users/mohdkaif/Desktop/Payment/lib/types.ts):

### 2.1 Customer Registration & Autopay Mandate Setup
- **Endpoint**: `POST /customers/register`
- **Content-Type**: `multipart/form-data`
- **Request Fields**:
  - `name` (string, required): Customer full name.
  - `contact` (string, required): Phone number (+91 10-digit format).
  - `email` (string, required): Customer email address.
  - `upi_vpa` (string, required): Linked UPI ID (e.g. `name@bank`).
  - `step_up_pin` (string, optional): 4-digit Security PIN for borderline biometric fallback.
  - `consent_given_at` (string, optional): ISO-8601 timestamp of DPDP consent.
  - `consent_version` (string, optional): Version string (e.g. `"v1.0_DPDP_2023"`).
  - `palm_photos` (file / binary, required): Image frame file(s).
- **Response Format (`RegisterResponse`)**:
  ```json
  {
    "customer_id": 12,
    "mandate_order_id": "order_NzK123456789",
    "message": "Palm enrolled successfully. Mandate approval required."
  }
  ```

---

### 2.2 Biometric Scan 1: Customer Identification
- **Endpoint**: `POST /session/identify`
- **Content-Type**: `multipart/form-data`
- **Request Fields**:
  - `merchant_id` (string, required): Merchant terminal identifier.
  - `palm_photo` (file / binary, required): Captured palm frame image.
- **Response Format (`IdentifyResponse`)**:
  ```json
  {
    "matched": true,
    "status": "matched", // "matched" | "borderline" | "unmatched"
    "requires_step_up": false,
    "step_up_prompt": null,
    "customer_id": 12,
    "name": "Aditya Sharma",
    "masked_upi": "adi****@hdfcbank",
    "confidence": 0.984,
    "session_id": 104,
    "message": null
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
- **Response Format**:
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
- **Request Fields**:
  - `session_id` (integer, required): Active transaction session ID.
  - `palm_photo` (file / binary, required): Captured palm frame image.
- **Response Format (`AuthorizeResponse`)**:
  ```json
  {
    "status": "paid", // "paid" | "borderline" | "rejected_mismatch" | "failed"
    "requires_step_up": false,
    "step_up_prompt": null,
    "razorpay_payment_id": "pay_Kx9876543210",
    "receipt_url": "/receipts/104",
    "reason": null
  }
  ```

---

### 2.5 Secondary Factor Step-Up Verification
- **Endpoint**: `POST /session/step-up-verify`
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "session_id": 104,
    "secret": "1234" // 4-digit PIN or last 4 digits of phone number
  }
  ```
- **Response Format**: `AuthorizeResponse` or confirmation object (`{"status": "paid", ...}`).

---

### 2.6 Merchant Ledger Transactions
- **Endpoint**: `GET /transactions`
- **Response Format**:
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
        "mandate_token_id": "token_123456",
        "authorize_confidence": 0.984
      }
    ]
  }
  ```

---

### 2.7 Admin Directory Management
- **`GET /customers`**: Returns list of `AdminCustomer` objects.
- **`PUT /customers/{customer_id}`**: Updates editable customer details (`name`, `contact`, `email`, `upi_vpa`).
- **`DELETE /customers/{customer_id}`**: Permanently deletes customer identity and vector embeddings while retaining transaction audit rows.

---

## 3. Remote Raspberry Pi WebSocket Relay Protocol

When paired with a merchant terminal, the frontend connects to `ws://<backend-host>/ws/session/{pairing_token}`.

### 3.1 Token Generation Endpoint (Backend side)
- **Endpoint**: `POST /terminals/{terminal_id}/pairing-token`
- **Response**:
  ```json
  {
    "terminal_id": "term_pi_01",
    "token": "45af36a7-963f-40c1-8a02-7c5b95191be3",
    "pair_url": "http://localhost:3000/pair?terminal=term_pi_01&token=45af36a7-963f-40c1-8a02-7c5b95191be3",
    "expires_in": 120
  }
  ```

### 3.2 WebSocket Relay Message Protocol

#### Messages from Pi Terminal -> Backend -> Customer Browser:
1. **Live Preview Frame**:
   ```json
   { "type": "video_frame", "data": "data:image/jpeg;base64,..." }
   ```
2. **Detection State Updates**:
   ```json
   {
     "type": "detection_state",
     "state": "positioning" | "holding" | "captured" | "none",
     "feedback": "Center palm in viewfinder",
     "hold_progress": 85
   }
   ```
3. **Capture Complete Multi-Frame Payload**:
   ```json
   {
     "type": "capture_complete",
     "frames": ["data:image/jpeg;base64,...", "data:image/jpeg;base64,..."],
     "mode": "identify" | "authorize"
   }
   ```
4. **Pairing Confirmation**:
   ```json
   {
     "type": "pairing_success",
     "terminal_id": "term_pi_01",
     "token": "...",
     "message": "Connected to remote terminal."
   }
   ```

#### Messages from Customer Browser -> Backend -> Pi Terminal:
1. **Start Scan Command**:
   ```json
   { "type": "start_scan", "mode": "identify" | "authorize", "amount": 50 }
   ```
2. **Cancel Command**:
   ```json
   { "type": "cancel" }
   ```

---

## 4. Summary of Full Stack Backup Branch

If you wish to reuse or inspect the working Python backend implementation (FastAPI, PyTorch MobileNetV2, CLAHE normalization, MediaPipe Python, SQLite vault, Razorpay Autopay integration, and standalone Pi client script), switch to the backup branch:

```bash
git checkout backup-full-stack-before-split
```
