"""
app.ws.progress
---------------
WebSocket endpoint for real-time training progress updates.

Ported from the sibling CV challenge's ``app/ws/progress.py``, with the entire
authentication block removed: this MVP has no accounts, no JWTs and no
database, so there is nothing to authenticate against and nothing to check
ownership of. A ``job_id`` is a client-generated UUID that only the tab that
generated it knows (see ``pr-based-plan/README.md`` -> "``job_id``").

Clients connect to ``/api/ws/training/{job_id}`` and receive JSON messages:

- **log** -- free-text log line
- **progress** -- numeric 0.0-1.0 progress fraction
- **metrics** -- per-epoch metrics dict
- **completed** -- training finished successfully
- **failed** -- training encountered an error
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("orbit.ws")

router = APIRouter()


class ConnectionManager:
    """Track active WebSocket connections grouped by ``job_id``."""

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, job_id: str, websocket: WebSocket) -> None:
        """Accept and register a WebSocket for the given *job_id*."""
        await websocket.accept()
        self._connections[job_id].append(websocket)
        logger.info(
            "WS client connected for job %s (total=%d)",
            job_id,
            len(self._connections[job_id]),
        )

    def disconnect(self, job_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket from the tracking list."""
        conns = self._connections.get(job_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self._connections.pop(job_id, None)
        logger.info("WS client disconnected for job %s", job_id)

    async def broadcast(self, job_id: str, message: dict[str, Any]) -> None:
        """Send a JSON *message* to every client watching *job_id*.

        Silently drops connections that have already closed. The server does
        not buffer messages for clients that are not connected yet -- hence the
        connection-order contract in the plan README.
        """
        conns = self._connections.get(job_id, [])
        stale: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(job_id, ws)

    @property
    def active_connections(self) -> dict[str, list[WebSocket]]:
        """Return the internal connections dict (for debugging)."""
        return dict(self._connections)


# Module-level singleton
manager = ConnectionManager()


@router.websocket("/api/ws/training/{job_id}")
async def training_ws(websocket: WebSocket, job_id: str) -> None:
    """Stream training progress for *job_id*. No authentication (MVP)."""
    await manager.connect(job_id, websocket)
    try:
        while True:
            # Keep the connection alive; ignore inbound data.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(job_id, websocket)
