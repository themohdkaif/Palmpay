# PalmPay

Cardless, phone-free checkout prototype: a customer pays by showing their palm twice.

1. **Identify (scan 1)** – the palm photo is located with MediaPipe, cropped to a normalized ROI, turned into a 128-D HOG+PCA embedding and matched against enrolled customers.
2. **Amount** – the merchant enters the amount (capped at ₹100 per transaction).
3. **Authorize (scan 2)** – a second scan must match the same customer; the backend then charges a Razorpay UPI Autopay mandate (mocked when no keys are set) and issues a PDF receipt.

Also included: 3-step enrollment with DPDP consent, PIN step-up fallback, merchant ledger, customer admin panel, English/Hindi UI, and a WebSocket relay for pairing a remote Raspberry Pi camera terminal.

## Project structure

```
├── src/                       Next.js 14 frontend (App Router, TypeScript, Tailwind)
│   ├── app/                   Pages: / · /scan · /receipt · /ledger · /pair · /about · /admin/users
│   ├── components/            UI components
│   ├── hooks/                 useHandDetection (in-browser MediaPipe hand tracking)
│   └── lib/                   API client, Zustand store, types, validation, audio, i18n
├── backend/                   FastAPI service (Python 3.10)
│   ├── app/
│   │   ├── main.py            App entry point, CORS, router registration
│   │   ├── config.py          Environment settings
│   │   ├── database.py · models.py · schemas.py
│   │   ├── routes/            customers · sessions · transactions · terminals
│   │   ├── services/          biometrics pipeline · Razorpay client · PDF receipts
│   │   └── palm/              detector · embedder · matcher · augment
│   ├── assets/                hand_landmarker.task, pca.joblib (model artifacts)
│   ├── scripts/               fit_pca.py, pi_capture_client.py
│   ├── data/                  SQLite DB + generated receipts (git-ignored, created at runtime)
│   ├── Dockerfile
│   └── requirements.txt
├── vercel.json
└── package.json
```

## Run locally

Requirements: Node.js 18.17+ and Python 3.10.

**Backend** (http://localhost:8000, interactive docs at `/docs`):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # optional
uvicorn app.main:app --reload --port 8000
```

**Frontend** (http://localhost:3000), in a second terminal from the project root:

```bash
npm install
cp .env.example .env.local  # optional
npm run dev
```

`npm run build` creates a production build and `npm start` serves it.

## Environment variables

Every variable is optional; empty values fall back to the default.

Frontend (`.env.local`, or Vercel project settings):

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL of the backend |
| `NEXT_PUBLIC_DETECTION_INTERVAL_MS` | `120` | In-browser hand detection interval |
| `NEXT_PUBLIC_MEDIAPIPE_DELEGATE` | `GPU` | `GPU` or `CPU` (falls back to CPU automatically) |

Backend (`backend/.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | empty | Razorpay credentials; when empty, payments are mocked |
| `AUTO_APPROVE_MANDATE` | `true` | Issue a mock mandate token at enrollment |
| `MATCH_THRESHOLD`, `VERIFY_THRESHOLD` | `0.58` | Similarity thresholds for scan 1 / scan 2 |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `DATABASE_URL` | `sqlite:///backend/data/palmpay.db` | SQLAlchemy database URL |
| `RECEIPTS_DIR` | `backend/data/receipts` | Where PDF receipts are written |
| `HAND_LANDMARKER_MODEL`, `PALM_PCA_PATH` | files in `backend/assets/` | Model artifact paths |

## Deploy

The app is two deployables: the Next.js frontend goes on Vercel, and the Python backend goes on a container host. The backend cannot run as Vercel serverless functions: it needs long-lived WebSockets, an in-memory embedding index, a writable disk for SQLite and receipts, and its ML dependencies (MediaPipe, OpenCV, scikit-learn) exceed the function size limit.

**1. Backend** – deploy `backend/` with its `Dockerfile` to any container host (Render, Railway, Fly.io, a VPS…):

```bash
docker build -t palmpay-api backend
docker run -p 8000:8000 -v palmpay-data:/srv/data --env-file backend/.env palmpay-api
```

Mount a persistent volume at `/srv/data`, set `CORS_ORIGINS` to your Vercel URL, and serve it over HTTPS (the browser needs `https://` and `wss://` from a Vercel page).

**2. Frontend** – import the repository in Vercel (or run `vercel --prod`). `vercel.json` already sets the Next.js framework, build command and output directory, and `.vercelignore` keeps `backend/` out of the build. Set `NEXT_PUBLIC_API_URL` to the backend's public URL in the project's environment variables, then redeploy.

## Notes

- Enrolled palm embeddings are tied to `backend/assets/pca.joblib`. `python -m scripts.fit_pca` (run from `backend/`) refits it, which invalidates existing enrollments.
- `backend/scripts/pi_capture_client.py` is the camera client for a Raspberry Pi terminal (direct POST or WebSocket relay mode).
- This is a prototype: customer data in SQLite is unencrypted and the admin panel has no authentication.
