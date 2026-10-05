"""
app.routers.train
-----------------
The HTTP API: health, training kickoff, prediction, and model status.

PR-02 scope: training is a **fake trainer** that sleeps and emits the real
WebSocket message protocol, and ``POST /api/predict`` returns a hardcoded
prediction. Both bodies are replaced in PR-05; the request/response schemas in
``app.schemas`` and the endpoint signatures are already final.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.schemas import (
    HealthResponse,
    ModelStatusResponse,
    PredictionItem,
    PredictRequest,
    PredictResponse,
    TrainRequest,
)
from app.services import registry
from app.ws.progress import manager

logger = logging.getLogger("orbit.api")

router = APIRouter(prefix="/api")

# ── Fake-trainer tuning (PR-02 only; PR-05 deletes this) ────────────────
FAKE_EPOCHS = 5
FAKE_EPOCH_DELAY_SECONDS = 0.3

# ``asyncio.create_task`` only holds a weak reference to its task, so a
# fire-and-forget task can be garbage-collected mid-flight. Keep a strong
# reference until it finishes.
_background_tasks: set[asyncio.Task[None]] = set()


def _spawn(coro: Any) -> None:
    """Run *coro* in the background, keeping a strong reference to the task."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _fake_training_run(job_id: str) -> None:
    """Simulate a training run, emitting the real message protocol.

    PR-05 replaces this entire function with a real PyTorch training loop
    driven from a worker thread. The message types, their payload shapes and
    their order are the contract and do not change.
    """
    try:
        await manager.broadcast(job_id, {"type": "log", "message": "Training started"})

        for epoch in range(1, FAKE_EPOCHS + 1):
            await asyncio.sleep(FAKE_EPOCH_DELAY_SECONDS)
            await manager.broadcast(
                job_id, {"type": "progress", "progress": epoch / FAKE_EPOCHS}
            )
            await manager.broadcast(
                job_id,
                {
                    "type": "metrics",
                    "metrics": {
                        "epoch": epoch,
                        # Fake curves: losses decay, accuracy climbs.
                        "intent_loss": round(1.6 * (0.6**epoch), 4),
                        "amount_loss": round(0.9 * (0.65**epoch), 4),
                        "intent_accuracy": round(1.0 - 0.8 * (0.55**epoch), 4),
                    },
                },
            )

        # Mark the job trained *before* announcing completion, so a client that
        # reacts to ``completed`` by calling /api/predict cannot race the
        # registry write.
        registry.set_model(job_id, True)
        await manager.broadcast(
            job_id, {"type": "completed", "message": "Training complete"}
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Fake training failed for job %s", job_id)
        await manager.broadcast(job_id, {"type": "failed", "message": str(exc)})


# ── Endpoints ───────────────────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness probe."""
    return HealthResponse(status="ok")


@router.post("/train", status_code=status.HTTP_202_ACCEPTED)
async def train(request: TrainRequest) -> dict[str, str]:
    """Kick off training for ``request.job_id`` and return immediately.

    Returns ``202 Accepted`` without awaiting the training run -- the real
    result is observed over the ``job_id``'s WebSocket channel. The client must
    already have that socket **fully open** before calling this (see the plan
    README's connection-order contract); nothing is buffered for a client that
    is not connected yet.

    PR-02 validates ``corpus``/``epochs``/``learning_rate`` through the schema
    but ignores their content.
    """
    logger.info(
        "Training requested for job %s (%d examples, %d epochs, lr=%s)",
        request.job_id,
        len(request.corpus),
        request.epochs,
        request.learning_rate,
    )
    _spawn(_fake_training_run(request.job_id))
    return {"job_id": request.job_id, "status": "accepted"}


@router.get("/model/{job_id}", response_model=ModelStatusResponse)
async def model_status(job_id: str) -> ModelStatusResponse:
    """Report whether a trained model exists for *job_id*.

    A pure registry lookup with no side effects. **Always 200, never 404** --
    the frontend branches on the boolean, and a 404 here would look like a bug
    in the browser console. This is the recovery path for a client that missed
    the ``completed`` WebSocket message.
    """
    return ModelStatusResponse(job_id=job_id, trained=registry.has_model(job_id))


@router.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest) -> PredictResponse:
    """Run *request.sentences* through the model trained for *request.job_id*.

    Unlike ``GET /api/model/{job_id}``, this **does** 404 when no model exists:
    there is no useful response body to return, and the caller is expected to
    have checked the status endpoint first.

    PR-02 returns a hardcoded prediction for every sentence. PR-05 replaces the
    body below with real inference and leaves the schema alone.
    """
    if not registry.has_model(request.job_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No trained model for job_id {request.job_id!r}",
        )

    predictions = [
        PredictionItem(
            sentence=sentence,
            intent="STRAIGHT",
            amount_cm=10.0,
            command="STRAIGHT 10",
        )
        for sentence in request.sentences
    ]
    return PredictResponse(job_id=request.job_id, predictions=predictions)
