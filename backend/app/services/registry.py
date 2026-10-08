"""
app.services.registry
---------------------
In-memory ``job_id -> trained model`` store.

A module-level singleton dict, mirroring the CV app's module-level
``training_queue`` singleton pattern. There is deliberately no database and no
persistence: restarting the backend invalidates every ``job_id``, which is
exactly the case ``GET /api/model/{job_id}`` exists to detect.

In PR-02 the stored value is a sentinel (``True``) written by the fake trainer,
so ``POST /api/predict``'s 404 logic has something real to check. PR-05 stores
the actual trained model object in the same slot; the accessor signatures below
do not change.
"""

from __future__ import annotations

from typing import Any

# job_id -> trained model object (PR-02: the sentinel ``True``).
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
