"""
app.services.model
------------------
The intent/amount NLU model, plus ``train_model`` and ``predict``.

Architecture (``pr-based-plan/README.md`` -> "Model architecture")::

    token ids -> Embedding -> masked mean-pool -> Linear+ReLU ("shared")
        intent head: Linear(shared)                          -> 5 logits
        amount head: Linear(concat(shared, num_value, has_num)) -> 1 scalar

- The **intent head never sees the numeric channel**: "do a 180" and "go 180
  cm" must be separated by wording, not magnitude.
- The amount head works in **scaled units** (``amount_cm / 100``). Raw
  centimeter targets make the MSE ~3000x the cross-entropy and swamp the
  shared trunk; ``predict`` multiplies back by 100.
- Loss = intent cross-entropy + amount MSE, equally weighted, with the MSE
  **masked** to rows whose *true* intent is STRAIGHT/BACKWARDS.

Training is full-batch gradient descent (Adam): the corpus is ~150 examples,
so one batch per epoch is cheap, and it makes the class-grouped order that
``corpus.generate_corpus`` returns irrelevant -- there are no minibatches to
be class-homogeneous.

This module is framework-agnostic on purpose: no FastAPI, no WebSocket, no
registry, no event loop. ``on_epoch_end`` is the only bridge; PR-05 does the
broadcasting.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional, Sequence

import torch
from torch import nn
from torch.nn import functional as F

from app.services.corpus import INTENTS, NUMERIC_INTENTS, Intent, TrainingExample
from app.services.tokenizer import PAD_ID, Tokenizer

#: Index -> intent label for the intent head's logits. The README's vocabulary
#: order, i.e. ``corpus.INTENTS`` (also ``schemas.Intent``'s order), so the
#: backend has exactly one ordering. Always decode by indexing this constant;
#: never assume positional correspondence with anything else.
INTENT_LABELS: tuple[Intent, ...] = INTENTS

_INTENT_INDEX: dict[str, int] = {label: i for i, label in enumerate(INTENT_LABELS)}

#: Command text for the three fixed-angle intents (README command grammar).
_TURN_COMMANDS: dict[str, str] = {
    "TURN_RIGHT": "TURN RIGHT",
    "TURN_LEFT": "TURN LEFT",
    "TURN_180": "TURN 180",
}

#: Amount-head targets are ``amount_cm / AMOUNT_SCALE``; predictions are
#: multiplied back by it.
AMOUNT_SCALE = 100.0

#: Metric keys passed to ``on_epoch_end``, in order.
METRIC_KEYS = ("epoch", "intent_loss", "amount_loss", "intent_accuracy")


class IntentAmountModel(nn.Module):
    """Bag-of-embeddings classifier with a masked amount-regression head."""

    def __init__(self, vocab_size: int, embed_dim: int = 32, hidden_dim: int = 32):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=PAD_ID)
        self.shared = nn.Linear(embed_dim, hidden_dim)
        self.intent_head = nn.Linear(hidden_dim, len(INTENT_LABELS))
        # +2 inputs: the numeric channel (num_value, has_num).
        self.amount_head = nn.Linear(hidden_dim + 2, 1)

    def forward(
        self,
        token_ids: torch.Tensor,  # [batch, seq]
        pad_mask: torch.Tensor,  # [batch, seq], 1.0 for real tokens, 0.0 for <pad>
        num_feats: torch.Tensor,  # [batch, 2] == (num_value, has_num)
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Returns (intent_logits [batch, 5], amount_pred [batch]).

        amount_pred is in SCALED units (amount_cm / 100), not centimeters.
        """
        mask = pad_mask.unsqueeze(-1)  # [batch, seq, 1]
        summed = (self.embedding(token_ids) * mask).sum(dim=1)
        # clamp: an all-<pad> row (empty sentence) pools to zeros, not NaN.
        pooled = summed / mask.sum(dim=1).clamp(min=1.0)
        shared = F.relu(self.shared(pooled))

        intent_logits = self.intent_head(shared)
        amount_pred = self.amount_head(torch.cat([shared, num_feats], dim=-1)).squeeze(-1)
        return intent_logits, amount_pred


@dataclass
class TrainedModel:
    """What ``train_model`` returns: the network plus the tokenizer it needs.

    One object per job, which is what ``registry.set_model(job_id, ...)``
    stores (the README describes the registry as ``{job_id: TrainedModel}``).
    """

    model: IntentAmountModel
    tokenizer: Tokenizer


def _encode_batch(
    tokenizer: Tokenizer, sentences: Sequence[str]
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Encode and right-pad sentences into ``(token_ids, pad_mask, num_feats)``."""
    encoded = [tokenizer.encode(sentence) for sentence in sentences]
    width = max(1, max(len(ids) for ids, _, _ in encoded))
    token_ids = torch.full((len(encoded), width), PAD_ID, dtype=torch.long)
    pad_mask = torch.zeros((len(encoded), width), dtype=torch.float32)
    num_feats = torch.zeros((len(encoded), 2), dtype=torch.float32)
    for row, (ids, num_value, has_num) in enumerate(encoded):
        token_ids[row, : len(ids)] = torch.tensor(ids, dtype=torch.long)
        pad_mask[row, : len(ids)] = 1.0
        num_feats[row, 0] = num_value
        num_feats[row, 1] = has_num
    return token_ids, pad_mask, num_feats


def train_model(
    corpus: list[TrainingExample],
    epochs: int,
    learning_rate: float,
    on_epoch_end: Optional[Callable[[dict[str, Any]], None]] = None,
) -> TrainedModel:
    """Train a fresh model on *corpus* and return it with its tokenizer.

    Full-batch Adam for *epochs* epochs. After every epoch ``on_epoch_end`` is
    called (exactly *epochs* times) with::

        {"epoch": int (1-based), "intent_loss": float,
         "amount_loss": float, "intent_accuracy": float}

    ``amount_loss`` is the masked MSE on scaled targets -- the exact term used
    for the gradient -- and is ``0.0`` when the corpus has no STRAIGHT/BACKWARDS
    rows. ``intent_accuracy`` is training-set accuracy in ``[0, 1]`` from the
    same forward pass. All values are plain Python numbers.

    Weight init uses torch's global RNG; seed it (``torch.manual_seed``) before
    calling if you need reproducibility. Nothing else here is random.
    """
    if not corpus:
        raise ValueError("corpus must contain at least one example")
    if epochs < 1:
        raise ValueError("epochs must be >= 1")
    if learning_rate <= 0:
        raise ValueError("learning_rate must be > 0")

    tokenizer = Tokenizer.build([example.sentence for example in corpus])
    token_ids, pad_mask, num_feats = _encode_batch(
        tokenizer, [example.sentence for example in corpus]
    )
    intent_targets = torch.tensor(
        [_INTENT_INDEX[example.intent] for example in corpus], dtype=torch.long
    )
    amount_mask = torch.tensor(
        [example.intent in NUMERIC_INTENTS for example in corpus], dtype=torch.bool
    )
    amount_targets = torch.tensor(
        [
            (example.amount_cm or 0.0) / AMOUNT_SCALE
            if example.intent in NUMERIC_INTENTS
            else 0.0
            for example in corpus
        ],
        dtype=torch.float32,
    )
    has_amounts = bool(amount_mask.any())

    model = IntentAmountModel(tokenizer.vocab_size)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    model.train()

    for epoch in range(1, epochs + 1):
        optimizer.zero_grad()
        intent_logits, amount_pred = model(token_ids, pad_mask, num_feats)

        intent_loss = F.cross_entropy(intent_logits, intent_targets)
        if has_amounts:
            amount_loss = F.mse_loss(amount_pred[amount_mask], amount_targets[amount_mask])
        else:
            amount_loss = torch.zeros(())
        (intent_loss + amount_loss).backward()
        optimizer.step()

        if on_epoch_end is not None:
            accuracy = (intent_logits.argmax(dim=-1) == intent_targets).float().mean()
            on_epoch_end(
                {
                    "epoch": epoch,
                    "intent_loss": intent_loss.item(),
                    "amount_loss": amount_loss.item(),
                    "intent_accuracy": accuracy.item(),
                }
            )

    model.eval()
    return TrainedModel(model=model, tokenizer=tokenizer)


def predict(model: IntentAmountModel, tokenizer: Tokenizer, sentence: str) -> dict[str, Any]:
    """Predict one sentence: ``{"intent", "amount_cm", "command"}``.

    ``amount_cm`` is whole centimeters (a float, floored at 0) for
    STRAIGHT/BACKWARDS and ``None`` for turns -- the amount head's output is
    discarded entirely for a predicted turn, even if the sentence has a numeral.
    ``command`` follows the README grammar: ``"STRAIGHT 40"``, ``"TURN 180"``.
    """
    token_ids, pad_mask, num_feats = _encode_batch(tokenizer, [sentence])
    model.eval()
    with torch.inference_mode():
        intent_logits, amount_pred = model(token_ids, pad_mask, num_feats)

    intent = INTENT_LABELS[int(intent_logits[0].argmax())]
    if intent in NUMERIC_INTENTS:
        amount_cm: Optional[float] = float(max(0, round(amount_pred[0].item() * AMOUNT_SCALE)))
        command = f"{intent} {int(amount_cm)}"
    else:
        amount_cm = None
        command = _TURN_COMMANDS[intent]
    return {"intent": intent, "amount_cm": amount_cm, "command": command}
