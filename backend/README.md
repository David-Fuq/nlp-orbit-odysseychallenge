# Orbit Odyssey NLP — backend

FastAPI service that trains and serves a small NLU model (intent
classification + numeric slot regression) for the Orbit Odyssey NLP
challenge. One model per browser tab, keyed by a client-generated `job_id`,
held **in memory only** — restarting this process invalidates every `job_id`.

The endpoints still run PR-02's **fake trainer**: it sleeps and emits the real
WebSocket message protocol. The real model (PR-04) lives in
`app/services/tokenizer.py` and `app/services/model.py` but is **not wired to
any endpoint yet** — PR-05 swaps it in without changing any endpoint or
schema. See "Model interface" below.

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

### PyTorch (CPU-only)

`requirements.txt` pins `torch==2.14.1+cpu` and adds the PyTorch CPU index
with `--extra-index-url`, so the plain `pip install -r requirements.txt`
above installs the **CPU-only** wheel — no flag to remember. The default PyPI
wheel can pull the CUDA build (multiple GB) for no benefit; this model is
deliberately tiny and CPU-only. Check with:

```
python -c "import torch; print(torch.__version__)"   # should end in +cpu
```

If you only want to add torch to an existing venv by hand:
`pip install torch --index-url https://download.pytorch.org/whl/cpu`.

The `+cpu` local-version pin exists on the Windows and Linux CPU index only
(this project is local-only on Windows). torch prints a harmless "Failed to
initialize NumPy" warning on import: numpy is deliberately not a dependency.

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

## Model interface (PR-04, for PR-05)

`app/services/model.py` is framework-agnostic: no FastAPI, no WebSocket, no
registry, no event loop. Train and predict like this:

```python
from app.services.corpus import TrainingExample   # the dataclass, not app.schemas'
from app.services.model import TrainedModel, train_model, predict

trained: TrainedModel = train_model(
    corpus,            # list[app.services.corpus.TrainingExample]
    epochs,            # int >= 1
    learning_rate,     # float > 0 (presets are PR-08's frontend mapping)
    on_epoch_end=cb,   # optional Callable[[dict], None]
)
registry.set_model(job_id, trained)          # one object per job

trained = registry.get_model(job_id)
predict(trained.model, trained.tokenizer, sentence)
# -> {"intent": "STRAIGHT", "amount_cm": 40.0, "command": "STRAIGHT 40"}
# -> {"intent": "TURN_180", "amount_cm": None, "command": "TURN 180"}
```

- **Return shape**: `TrainedModel` is a dataclass with `.model`
  (`IntentAmountModel`, already in eval mode) and `.tokenizer` (`Tokenizer`).
  It is the one object `registry.set_model` stores per `job_id`.
- **Input type**: `train_model` takes `app.services.corpus.TrainingExample`
  (dataclass). `POST /api/train` parses `app.schemas.TrainingExample`
  (pydantic); converting wire → dataclass at the router boundary is PR-05's job.
- **`on_epoch_end`** is called exactly `epochs` times, synchronously from the
  training thread, with `{"epoch", "intent_loss", "amount_loss",
  "intent_accuracy"}` — `epoch` is 1-based, the rest are plain floats,
  `amount_loss` is the scaled (`amount_cm / 100`) masked MSE actually used for
  the gradient. Broadcast it unchanged as
  `{"type": "metrics", "metrics": payload}`.
- **`predict`** returns exactly the `PredictionItem` fields minus `sentence`.
  `amount_cm` is whole centimeters (float) for STRAIGHT/BACKWARDS and `None`
  for every turn — the amount head's output is discarded for turns.
- **Intent order**: `model.INTENT_LABELS` (= `corpus.INTENTS`, the README's
  vocabulary order) maps logit index → label. `predict` already decodes by
  name; anything else decoding logits must index `INTENT_LABELS`.
- **Tokenizer**: lowercase, whitespace split, strip leading/trailing
  punctuation per token (for vocab lookup *and* the numeral test), every
  numeral → shared `<num>` token plus the `(num_value, has_num)` numeric
  channel. First numeral in a sentence wins (known limitation).
- **Determinism**: weight init uses torch's global RNG; training is full-batch,
  so `torch.manual_seed(n)` before `train_model` makes a run reproducible.
  PR-05 does not need to seed.

## What this service deliberately does not have

No authentication, no JWTs, no database, no job queue. The sibling CV
challenge's backend has all of those because YOLO training is heavy and
multi-user; this model is tiny and single-tab, so none of it is needed. Their
absence is a locked decision in `pr-based-plan/README.md`, not an oversight —
do not reintroduce them.
