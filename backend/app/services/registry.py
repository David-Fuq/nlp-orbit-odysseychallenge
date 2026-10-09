"""
app.services.registry
---------------------
In-memory ``job_id -> trained model`` store.

A module-level singleton dict, mirroring the CV app's module-level
``training_queue`` singleton pattern. There is deliberately no database and no
persistence: restarting the backend invalidates every ``job_id``, which is
exactly the case ``GET /api/model/{job_id}`` exists to detect.

The stored value is the ``app.services.model.TrainedModel`` that
``train_model`` returns (``.model`` + ``.tokenizer``), written by
``app.routers.train`` only after a run succeeds. (PR-02 stored the sentinel
``True`` here; the accessor signatures did not change.) Values stay typed
``Any`` so this module does not import torch.
"""

from __future__ import annotations

from typing import Any

# job_id -> app.services.model.TrainedModel.
_models: dict[str, Any] = {}


def set_model(job_id: str, model: Any) -> None:
    """Register (or replace) the trained model for *job_id*."""
    _models[job_id] = model


def get_model(job_id: str) -> Any | None:
    """Return the trained model for *job_id*, or ``None`` if there is none."""
    return _models.get(job_id)


def has_model(job_id: str) -> bool:
    """Whether a trained model exists for *job_id*."""
    return job_id in _models


def clear() -> None:
    """Drop every registered model. Used by tests to isolate cases."""
    _models.clear()
