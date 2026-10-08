# Orbit Odyssey NLP — backend

FastAPI service that trains and serves a small NLU model (intent
classification + numeric slot regression) for the Orbit Odyssey NLP
challenge. One model per browser tab, keyed by a client-generated `job_id`,
held **in memory only** — restarting this process invalidates every `job_id`.

As of PR-02 the training is a **fake trainer**: it sleeps and emits the real
WebSocket message protocol, but there is no PyTorch and no real model. PR-05
swaps in the real training loop and real inference without changing any
endpoint or schema.

## Setup

`python` is not on `PATH` on this machine; use the launcher. From `backend/`:

```
py -3.13 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The Next.js frontend runs separately on port 3000 (`npm run dev` from
`frontend/`); both processes run at once, in two terminals. CORS is open to
`http://localhost:3000` only — see `app/config.py`.

### A note for PR-04

PR-04 adds `torch`. Install the **CPU-only** wheel:

```
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

The default PyPI wheel pulls the CUDA build (multiple GB) for no benefit —
this model is deliberately tiny and CPU-only.

## Tests

```
pytest
```

`pytest.ini` sets `asyncio_mode = auto`; without it `pytest-asyncio` skips or
errors on async tests instead of running them.

The WebSocket test uses `fastapi.testclient.TestClient`, not
`httpx.AsyncClient` — httpx cannot open a WebSocket at all.

## API

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | `200 {"status": "ok"}` |
| `POST` | `/api/train` | `202` immediately; progress arrives over the WS channel |
| `POST` | `/api/predict` | `404` when no model exists for the `job_id` |
| `GET` | `/api/model/{job_id}` | **Always `200`**, with a `trained` boolean |
| `WS` | `/api/ws/training/{job_id}` | No auth (MVP) |

### WebSocket message protocol

```json
{"type": "log",       "message": "..."}
{"type": "progress",  "progress": 0.42}
{"type": "metrics",   "metrics": {"epoch": 3, "intent_loss": 0.31, "amount_loss": 4.2, "intent_accuracy": 0.86}}
{"type": "completed", "message": "Training complete"}
{"type": "failed",    "message": "..."}
```

### Connection-order contract

The client must have the WebSocket for a `job_id` **fully open** — not merely
constructed — before calling `POST /api/train` with that `job_id`. Nothing is
buffered for a client that is not connected yet, and this toy model trains
fast enough to finish before a still-`CONNECTING` socket opens.
`GET /api/model/{job_id}` is the recovery path for a missed `completed`
message.

## What this service deliberately does not have

No authentication, no JWTs, no database, no job queue. The sibling CV
challenge's backend has all of those because YOLO training is heavy and
multi-user; this model is tiny and single-tab, so none of it is needed. Their
absence is a locked decision in `pr-based-plan/README.md`, not an oversight —
do not reintroduce them.
