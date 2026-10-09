"""
app.services.tokenizer
----------------------
Fixed-vocabulary word tokenizer for the intent/amount model.

Contracts this module implements (``pr-based-plan/README.md`` -> "Model
architecture"):

- **Lowercase, whitespace split**, then strip leading/trailing punctuation from
  each token. Edge stripping applies to *both* the numeral test and the vocab
  lookup: the training corpus has no trailing periods or commas (PR-03), but
  students type free text in Step 2/Step 5 and PR-09 splits prose sentences, so
  without it every sentence-final word ("centimeters.") would be ``<unk>``.
  That is the only normalisation -- no stemming, no subword splitting, no
  stopword removal, and internal punctuation is untouched ("go-ahead",
  "counter-clockwise" and "12.5" stay whole). A token that is *only*
  punctuation (a lone "-") is dropped.
- **Every numeral maps to the single shared ``<num>`` token.** Digits never
  enter the vocabulary, so an unseen number is not an out-of-vocabulary word
  and cannot perturb the intent prediction. A numeral is any token that parses
  as a finite float after edge stripping ("40", "40,", "40.", "12.5"); "nan"
  and "inf" are words, not numerals. "40cm" does not parse, so it is ``<unk>``.
- **Numeric channel**: ``encode`` also returns ``(num_value, has_num)`` --
  the first numeral divided by 100 (``0.0`` if none) and ``1.0``/``0.0``.
  Magnitude travels only through this channel, never the embedding table.
- **Known limitation (documented, not fixed): the first numeral wins.** A
  sentence with a decoy number before the distance ("at marker 3 go 40 cm")
  feeds ``3`` to the amount head. Corpus templates carry at most one numeral
  per distance sentence for this reason (PR-03); a student sentence like that
  gets a noisy input feature, but its label is still correct.
"""

from __future__ import annotations

import math
import string
from typing import Optional

PAD = "<pad>"
UNK = "<unk>"
NUM = "<num>"

#: Reserved indices. ``<pad>`` is 0 so it can be the embedding's padding_idx.
PAD_ID = 0
UNK_ID = 1
NUM_ID = 2

#: Numeral magnitudes are divided by this before entering the numeric channel,
#: the same scale the amount head's targets use (``amount_cm / 100``).
NUM_SCALE = 100.0


def _tokens(sentence: str) -> list[str]:
    """Lowercase, whitespace-split, strip token-edge punctuation, drop empties."""
    stripped = (token.strip(string.punctuation) for token in sentence.lower().split())
    return [token for token in stripped if token]


def _numeral(token: str) -> Optional[float]:
    """The token's value if it is a numeral (parses as a finite float), else None."""
    try:
        value = float(token)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


class Tokenizer:
    """Maps sentences to vocabulary ids plus the two-scalar numeric channel."""

    def __init__(self, vocab: dict[str, int]) -> None:
        for token, index in ((PAD, PAD_ID), (UNK, UNK_ID), (NUM, NUM_ID)):
            if vocab.get(token) != index:
                raise ValueError(f"vocab must map {token!r} to {index}")
        self.vocab = dict(vocab)

    @classmethod
    def build(cls, sentences: list[str]) -> "Tokenizer":
        """Build a fixed vocabulary from training sentences.

        Reserved ids first (``<pad>``, ``<unk>``, ``<num>``), then every
        remaining unique non-numeral token in sorted order, so the same corpus
        always yields the same ids regardless of example order.
        """
        words = {
            token
            for sentence in sentences
            for token in _tokens(sentence)
            if _numeral(token) is None
        }
        vocab = {PAD: PAD_ID, UNK: UNK_ID, NUM: NUM_ID}
        for word in sorted(words):
            vocab[word] = len(vocab)
        return cls(vocab)

    def encode(self, sentence: str) -> tuple[list[int], float, float]:
        """Return ``(token_ids, num_value, has_num)`` for *sentence*.

        ``token_ids`` uses ``<num>`` for every numeral and ``<unk>`` for words
        not in the vocabulary; it is empty for an empty sentence (the model's
        masked pooling handles that). ``num_value`` is the first numeral / 100
        (``0.0`` if none) and ``has_num`` is ``1.0`` if a numeral was found.
        """
        ids: list[int] = []
        first: Optional[float] = None
        for token in _tokens(sentence):
            value = _numeral(token)
            if value is None:
                ids.append(self.vocab.get(token, UNK_ID))
            else:
                ids.append(NUM_ID)
                if first is None:
                    first = value
        if first is None:
            return ids, 0.0, 0.0
        return ids, first / NUM_SCALE, 1.0

    @property
    def vocab_size(self) -> int:
        return len(self.vocab)
