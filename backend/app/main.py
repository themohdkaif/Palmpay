"""
PalmPay FastAPI application: biometric palm identification, Razorpay mandate charges and PDF receipts.

Run locally from the backend/ directory:
    uvicorn app.main:app --reload --port 8000
"""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.database import Base, SessionLocal, engine
from app.routes import customers, sessions, terminals, transactions
from app.services import biometrics

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        biometrics.reload_matcher(db)
    yield


app = FastAPI(
    title="PalmPay Biometric Micro-Payment Backend",
    description="Dual-stage biometric identification, Razorpay recurring mandate authorization, and tissue liveness checking.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time_ms = (time.perf_counter() - start_time) * 1000.0
    logger.info("%s %s -> %.2fms", request.method, request.url.path, process_time_ms)
    response.headers["X-Process-Time-MS"] = f"{process_time_ms:.2f}ms"
    return response


app.include_router(customers.router)
app.include_router(sessions.router)
app.include_router(transactions.router)
app.include_router(terminals.router)


@app.get("/", tags=["health"])
def health():
    return {"service": "PalmPay API", "status": "ok", "docs": "/docs"}
