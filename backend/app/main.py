"""
app.main
--------
FastAPI application for the Orbit Odyssey NLP backend.

Run locally from ``backend/``::

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import train
from app.ws import progress

app = FastAPI(
    title="Orbit Odyssey NLP backend",
    description=(
        "Trains and serves a per-tab NLU model for the Orbit Odyssey NLP "
        "challenge. Models live in memory only, keyed by a client-generated "
        "job_id. No accounts, no database."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(train.router)
app.include_router(progress.router)
