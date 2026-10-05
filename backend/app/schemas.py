"""
app.schemas
-----------
Pydantic request/response models for the HTTP API.

These shapes are the contract from ``pr-based-plan/README.md`` -> "HTTP
endpoints". PR-05 swaps the fake trainer and the fake predictor for real
implementations but **reuses these models unchanged** -- it must not redefine
them.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Intent = Literal["STRAIGHT", "BACKWARDS", "TURN_RIGHT", "TURN_LEFT", "TURN_180"]


class TrainingExample(BaseModel):
    """One labeled sentence from the student's dataset.

    ``amount_cm`` is required iff ``intent`` is ``STRAIGHT`` or ``BACKWARDS``;
    the three turn intents carry a fixed angle and never a number. PR-02 does
    not enforce that relationship -- the fake trainer ignores the corpus
    entirely -- it only has to parse.
    """

    sentence: str
    intent: Intent
    amount_cm: Optional[float] = None


class TrainRequest(BaseModel):
    """Body of ``POST /api/train``."""

    job_id: str
    corpus: list[TrainingExample]
    epochs: int = Field(gt=0)
    learning_rate: float = Field(gt=0)


class PredictRequest(BaseModel):
    """Body of ``POST /api/predict``."""

    job_id: str
    sentences: list[str]


class PredictionItem(BaseModel):
    """One model prediction.

    ``command`` is the fully formatted command string the path simulator
    consumes, e.g. ``"STRAIGHT 40"`` or ``"TURN LEFT"``.
    """

    sentence: str
    intent: Intent
    amount_cm: Optional[float] = None
    command: str


class PredictResponse(BaseModel):
    """Body of the ``POST /api/predict`` response."""

    job_id: str
    predictions: list[PredictionItem]


class ModelStatusResponse(BaseModel):
    """Body of the ``GET /api/model/{job_id}`` response."""

    job_id: str
    trained: bool


class HealthResponse(BaseModel):
    """Body of the ``GET /api/health`` response."""

    status: str
