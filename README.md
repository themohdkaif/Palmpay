# PalmPay — Palm Vein Biometric Payment Platform

**PalmPay** is an end-to-end prototype web application enabling cardless, phone-free physical merchant payments using contactless palm vein recognition and automated UPI Autopay recurring mandates.

---

## 1. Overview

PalmPay transforms physical point-of-sale checkout into a zero-touch 2-scan biometric transaction:
1. **Step 1 — Identify (Scan 1)**: The customer places their hand over the merchant optical sensor. MediaPipe hand landmarker extracts anatomical keypoints, crops the central palm Region of Interest (ROI), and projects vein pattern features into a 128-dimensional mathematical vector embedding. The vector is matched against enrolled customers to instantly identify the user.
2. **Step 2 — Remittance Entry**: The merchant enters the transaction sum (strictly capped at ₹100 for default prototype mandates).
3. **Step 3 — Authorize & Charge (Scan 2)**: The customer scans their palm a second time. Upon biometric verification confirming identity match with Step 1, PalmPay executes a recurring UPI Autopay charge via Razorpay API and generates an official cryptographic PDF payment certificate.

---

## 2. System Architecture Flow

```
[ Customer Palm ] ---> ( Web Cam Feed )
                              |
                              v
                 [ MediaPipe Landmarker ]
                              |
                     ( ROI Alignment )
                              |
                              v
                 [ HOG + PCA Embedder ] 
                 ( 128-D Vector Output )
                              |
                              v
                +----------------------------+
                |  FastAPI Backend (Py 3.10) |
                +----------------------------+
                    /          |           \
                   /           |            \
                  v            v             v
          [ Palm Matcher ]  [ SQLite DB ]  [ Razorpay API ]
           (Cosine/Dist)   (Customer/Txn) (Autopay Mandate)
                                                 |
                                                 v
                                         [ PDF Receipt Engine ]
```

---

## 3. Data Storage & Privacy Audit

The data architecture is strictly audited against India's **Digital Personal Data Protection (DPDP) Act 2023** biometrics standards:

| Entity / Data Point | Storage Location | Retention Policy & Security Status |
| :--- | :--- | :--- |
| **Customer Metadata** | SQLite (`palmpay.db` / `customers`) | Stores `name`, `contact` (phone), `email`, `upi_vpa`, `razorpay_customer_id`, `mandate_token_id`. |
| **DPDP Consent Audit** | SQLite (`palmpay.db` / `customers`) | Stores `consent_given_at` (ISO timestamp) and `consent_version` (`v1.0_DPDP_2023`). |
| **Palm Biometric Vector** | SQLite (`palmpay.db` / `palm_embeddings`) | **128-D mathematical float array** derived via HOG+PCA. Loaded into matcher memory on startup. |
| **Raw Palm Images** | **DISCARDED IMMEDIATELY** | **Zero disk persistence.** Image frames are processed in-memory (`photo.file.read()`), converted to vectors, and freed immediately. |
| **Transaction History** | SQLite (`palmpay.db` / `transactions`) | Stores merchant ID, transaction status, identify/authorize confidence scores, payment IDs, receipt paths. |
| **Language Preference** | Client-Side (`localStorage`) | Binds selected UI language (`en` or `hi`) in local browser storage (`palmpay_lang`). |

---

## 4. Tech Stack

### Frontend Application
- **Framework**: Next.js 14.2.15 (App Router, TypeScript 5.6)
- **Styling**: Vanilla Tailwind CSS 3.4 (`tailwind.config.ts`), PostCSS 8.4
- **State & Motion**: Zustand 4.5, GSAP 3.12 (`@gsap/react`), Canvas Confetti 1.9
- **Media & Icons**: `react-webcam` 7.2, Lucide React 0.453
- **Design System**: *Vault & Vein* Banknote Engraving Spec (`--ink #0F1A14`, `--paper #F1ECDD`, `--brass #B08D46`, `--vein #7A2E2E`, `--line #3A4A3E`, `Fraunces` Display Serif, `IBM Plex Mono` Numeral Tabular Font)

### Backend Service
- **Core Framework**: FastAPI (Python 3.10), Uvicorn 0.34
- **Computer Vision & ML**: OpenCV 4.13, MediaPipe 0.10.33, Scikit-Learn 1.6, Scikit-Image 0.25, NumPy 2.2
- **Database & ORM**: SQLite, SQLAlchemy 2.0, Pydantic 2.10
- **Payments & PDF**: Razorpay Python SDK 1.4, ReportLab 4.3 (PDF Engine)

---

## 5. Project Structure

```
Payment/
├── app/                        # Next.js App Router Routes
│   ├── layout.tsx              # Root layout & providers
│   ├── page.tsx                # Landing page & amount entry
│   ├── scan/page.tsx           # Scan 1 (Identify) & Scan 2 (Authorize) flow
│   ├── receipt/page.tsx        # Payment Certificate & PDF download page
│   ├── ledger/page.tsx         # Merchant Passbook Ledger audit trail
│   └── about/page.tsx          # DPDP Biometric Trust & Math disclosure
├── components/                 # UI Components (Vault & Vein Spec)
│   ├── AmountEntry.tsx         # Cheque remittance input & preset chips
│   ├── ScanFrame.tsx           # Optical viewfinder & laser sweep GUI
│   ├── RegisterModal.tsx       # 3-Step Registration & DPDP Consent Modal
│   ├── ReceiptCard.tsx         # Engraved certificate card & QR seal
│   ├── Navbar.tsx              # Header emblem, ledger link & language toggle
│   ├── AnimatedBackground.tsx  # Dynamic guilloché background mesh
│   └── VeinGuilloché.tsx       # SVG vector guilloché signature motif
├── lib/                        # Client Utilities & State
│   ├── api-client.ts           # REST API client wrapper
│   ├── types.ts                # Shared TypeScript interfaces
│   ├── validation.ts           # Phone & email format/domain validators
│   ├── audio.ts                # Web Audio API brass seal & click synth
│   └── i18n/                   # Bilingual Localization System
│       ├── LanguageContext.tsx # React i18n provider & hook
│       ├── en.ts               # English dictionary
│       └── hi.ts               # Devanagari Hindi dictionary
├── palmpay-backend/            # Python FastAPI Backend
│   ├── backend/
│   │   ├── main.py             # FastAPI REST endpoints & lifecycle
│   │   ├── models.py           # SQLAlchemy database tables
│   │   ├── schemas.py          # Pydantic request/response schemas
│   │   ├── database.py         # SQLite engine session binding
│   │   ├── receipt.py          # ReportLab PDF certificate generator
│   │   ├── palm/               # Biometric Computer Vision Pipeline
│   │   │   ├── align.py        # ROI palm center crop & warp
│   │   │   ├── augment.py      # Spatial augmentation generator
│   │   │   ├── detector.py     # MediaPipe Hand Landmarker detector
│   │   │   ├── embedder.py     # HOG feature extractor & PCA projector
│   │   │   └── matcher.py      # Euclidean vector distance matcher
│   │   └── payments/
│   │       └── razorpay_client.py # Razorpay Autopay mandate charge client
│   ├── scripts/
│   │   ├── list_customers.py   # CLI customer & consent inspector
│   │   └── test_end_to_end.py  # End-to-end integration test runner
│   ├── hand_landmarker.task   # MediaPipe pretrained task model
│   ├── pca.joblib              # Pre-trained 128-D PCA matrix
│   ├── palmpay.db              # Active SQLite database file
│   ├── receipts/               # Generated PDF receipt file storage
│   ├── requirements.txt        # Backend dependencies
│   └── .env.example            # Environment template
├── tailwind.config.ts          # Vault & Vein Design System Configuration
├── postcss.config.mjs          # PostCSS configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Frontend package dependencies & scripts
```

---

## 6. Setup & Local Run Instructions

### Prerequisites
- Node.js 18+ and `npm`
- Python 3.10+ and `pip`

### Step 1: Start Python FastAPI Backend
```bash
cd palmpay-backend
pip install -r requirements.txt

# Start Uvicorn server on port 8000
uvicorn backend.main:app --reload --port 8000
```
*Backend API active at `http://127.0.0.1:8000` (OpenAPI docs at `http://127.0.0.1:8000/docs`).*

### Step 2: Start Next.js Frontend Application
Open a second terminal at project root:
```bash
# Install dependencies
npm install

# Start Next.js development server
npm run dev
```
*Frontend application active at `http://localhost:3000`.*

---

## 7. Known Limitations & Gaps

1. **Razorpay Mandate Sandboxing**: Real banking mandate registration requires physical SMS OTP authentication via NPCI/Razorpay webview. In local development (`AUTO_APPROVE_MANDATE=true`), mandate authorization returns simulated token references (`mock_token_...`).
2. **SQLite At-Rest Encryption**: SQLite database `palmpay.db` stores customer metadata (phone, email, UPI VPA) unencrypted. Field-level AES-256 column encryption should be implemented prior to production deployment.
3. **Biometric Dataset FAR/FRR Calibration**: Biometric matching uses Euclidean distance between 128-D HOG+PCA features with a empirical match threshold of `MATCH_THRESHOLD=0.70`. Formal evaluation metrics (False Acceptance Rate / False Rejection Rate) require benchmark testing on larger datasets (10,000+ subjects).
4. **Vector Database Scaling**: Embedding vectors are currently stored as JSON lists in SQLite and loaded into memory on server startup (`load_existing_embeddings()`). High-throughput production deployments should utilize dedicated vector storage (e.g. Pgvector or Qdrant).

---

## 8. Features Implemented So Far

- [x] **DPDP Act 2023 Explicit Consent Gate**: 3-step registration flow enforcing explicit consent acknowledgment before camera capture; persists ISO timestamp in DB.
- [x] **Bilingual Localization System**: Live English ⇄ Devanagari Hindi toggle (`EN / हिं`) covering all user-facing text across all 10 pages and components.
- [x] **₹100 Remittance Mandate Cap**: Strict frontend input validation and backend mandate limit enforcement.
- [x] **2-Scan Biometric Flow**: Instant identification (Scan 1) and authorization charge verification (Scan 2).
- [x] **Sound Design**: Integrated Web Audio API brass seal impact and mechanical click synthesizers with persistent mute toggle control.
- [x] **Merchant Passbook Ledger**: Real-time transaction history page fetching directly from backend SQLite DB (`GET /transactions`).
- [x] **Cryptographic PDF & QR Receipt**: Dynamic ReportLab PDF generation with embedded verification QR code seal.
- [x] **Biometric Trust & About Panel**: Transparent architectural disclosure explaining HOG+PCA vector mathematics and DPDP compliance.
---

## 9. Raspberry Pi Hardware Setup & Browser Configuration

### Hardware & OS Requirements
- **Hardware**: Raspberry Pi 4B (4GB/8GB RAM recommended) or Raspberry Pi 5.
- **Camera Module**: OV5647 5MP / Sony IMX219 8MP CSI camera module, or standard USB V4L2 Webcam.
- **OS**: Raspberry Pi OS (64-bit ARM64) with Desktop environment.

### 1. Enable Camera Interface
Run raspi-config on the Raspberry Pi terminal to enable legacy/CSI camera access:
```bash
sudo raspi-config
# Navigate to: 3 Interface Options -> I1 Legacy Camera -> Enable -> Reboot
```

### 2. Install Node.js 20 LTS (ARM64)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Chromium Web Browser Configuration
Launch Chromium on the Raspberry Pi with WebGL & Camera permissions enabled:
- Open Chromium: `chromium-browser --enable-gpu-rasterization --ignore-gpu-blocklist http://localhost:3000`
- Grant camera permissions when prompted on the `/scan` page.

### 4. Optional Raspberry Pi Environment Performance Tuning
If running standalone MediaPipe WASM hand detection on low-power Pi 4B hardware, you can tune the detection interval and delegate in `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_DETECTION_INTERVAL_MS=250
NEXT_PUBLIC_MEDIAPIPE_DELEGATE=GPU
```
*Note: If GPU delegate is unsupported by Chromium on ARM64 WebGL, the frontend automatically falls back to CPU delegate without crashing.*

