"""
app.routers.train
-----------------
The HTTP API: health, training kickoff, prediction, and model status.

``POST /api/train`` trains PR-04's real model (``app.services.model``) in a
worker thread and streams the WebSocket message protocol from it;
``POST /api/predict`` runs real inference against the model stored for the
``job_id``. The request/response schemas in ``app.schemas`` and the endpoint
signatures are unchanged from PR-02.

Threading (PR-05):

- ``train_model`` is synchronous PyTorch, so it runs in ``asyncio.to_thread``,
  never on the event loop.
- ``on_epoch_end`` fires in that worker thread. It hands each message to the
  loop with ``run_coroutine_threadsafe`` and **blocks on ``.result()``** until
  the send finishes. Without that, every broadcast would be an independent
  task and nothing would guarantee epoch N's messages go out before epoch
  N+1's, or before ``completed``.
- The registry is written on the event loop after ``to_thread`` returns, and
  before ``completed`` is broadcast. A failed run writes nothing.
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
from app.schemas import TrainingExample as WireExample
from app.services import registry
from app.services.corpus import NUMERIC_INTENTS, load_base_corpus
from app.services.corpus import TrainingExample as CorpusExample
from app.services.model import TrainedModel, train_model
# Aliased: the ``predict`` endpoint below already owns that name.
from app.services.model import predict as predict_sentence
from app.ws.progress import manager

logger = logging.getLogger("orbit.api")

router = APIRouter(prefix="/api")

#: How long the training thread waits for one WS broadcast to finish before
#: giving up (which fails the run). Sends take microseconds; this only bounds
#: a wedged event loop.
BROADCAST_TIMEOUT_SECONDS = 10.0

# ``asyncio.create_task`` only holds a weak reference to its task, so a
# fire-and-forget task can be garbage-collected mid-flight. Keep a strong
# reference until it finishes.
_background_tasks: set[asyncio.Task[None]] = set()


def _spawn(coro: Any) -> None:
    """Run *coro* in the background, keeping a strong reference to the task."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def _to_corpus_examples(wire: list[WireExample]) -> list[CorpusExample]:
    """Convert the HTTP wire examples to the dataclass ``train_model`` takes.

    The schema parses ``amount_cm`` as optional for every intent; this is where
    "required iff STRAIGHT/BACKWARDS" is enforced. ``train_model`` would
    silently read a missing distance as 0 cm, so a mismatch raises
    ``ValueError`` instead, which the training task reports as ``failed``.
    """
    examples: list[CorpusExample] = []
    for index, item in enumerate(wire):
        numeric = item.intent in NUMERIC_INTENTS
        if numeric and item.amount_cm is None:
            raise ValueError(
                f"corpus[{index}] ({item.sentence!r}): {item.intent} examples "
                "require amount_cm"
            )
        if not numeric and item.amount_cm is not None:
            raise ValueError(
                f"corpus[{index}] ({item.sentence!r}): {item.intent} examples "
                f"must not carry amount_cm (got {item.amount_cm})"
            )
        examples.append(CorpusExample(item.sentence, item.intent, item.amount_cm))
    return examples


async def _training_run(request: TrainRequest) -> None:
    """Train a real model for ``request.job_id``, streaming the WS protocol.

    Message order: ``log`` ("Training started"), an optional ``log`` about the
    default corpus, one ``progress`` + ``metrics`` pair per epoch, then
    ``completed`` -- or ``failed`` at any point. Never raises.
    """
    job_id = request.job_id
    try:
        loop = asyncio.get_running_loop()
        await manager.broadcast(job_id, {"type": "log", "message": "Training started"})

        if request.corpus:
            corpus = _to_corpus_examples(request.corpus)
        else:
            corpus = load_base_corpus()
            await manager.broadcast(
                job_id,
                {
                    "type": "log",
                    "message": (
                        "No corpus supplied; training on the default base "
                        f"corpus ({len(corpus)} examples)"
                    ),
                },
            )

        def send_from_worker(message: dict[str, Any]) -> None:
            # Called from the training thread. Blocking until the send is done
            # keeps every message in order (see module docstring).
            asyncio.run_coroutine_threadsafe(
                manager.broadcast(job_id, message), loop
            ).result(timeout=BROADCAST_TIMEOUT_SECONDS)

        def on_epoch_end(metrics: dict[str, Any]) -> None:
            send_from_worker(
                {"type": "progress", "progress": metrics["epoch"] / request.epochs}
            )
            send_from_worker({"type": "metrics", "metrics": metrics})

        trained: TrainedModel = await asyncio.to_thread(
            train_model,
            corpus,
            request.epochs,
            request.learning_rate,
            on_epoch_end=on_epoch_end,
        )

        # Store the model *before* announcing completion, so a client that
        # reacts to ``completed`` by calling /api/predict cannot race the
        # registry write.
        registry.set_model(job_id, trained)
        await manager.broadcast(
            job_id, {"type": "completed", "message": "Training complete"}
        )
        logger.info("Training complete for job %s", job_id)
    except Exception as exc:
        # Nothing is written to the registry, so a previous successful model
        # for this job_id (if any) stays in place.
        logger.exception("Training failed for job %s", job_id)
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

    An empty ``corpus`` trains on the committed default corpus
    (``corpus.load_base_corpus()``). Invalid examples are reported as a
    ``failed`` WS message, not as an HTTP error.
    """
    logger.info(
        "Training requested for job %s (%d examples, %d epochs, lr=%s)",
        request.job_id,
        len(request.corpus),
        request.epochs,
        request.learning_rate,
    )
    _spawn(_training_run(request))
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

    Inference runs directly on the event loop: it is a few milliseconds of CPU
    per sentence with no I/O, and a request carries one student's sentence
    list, so a thread hop would cost more than it saves at this scale.
    """
    if not registry.has_model(request.job_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No trained model for job_id {request.job_id!r}",
        )

    trained: TrainedModel = registry.get_model(request.job_id)
    predictions = [
        PredictionItem(
            sentence=sentence,
            **predict_sentence(trained.model, trained.tokenizer, sentence),
        )
        for sentence in request.sentences
    ]
    return PredictResponse(job_id=request.job_id, predictions=predictions)
